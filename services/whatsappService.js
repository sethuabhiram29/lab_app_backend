const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  Browsers, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const qrcode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const WhatsAppSession = require('../models/WhatsAppSession');
const WhatsAppMessage = require('../models/WhatsAppMessage');

const AUTH_DIR = path.join(__dirname, '..', 'whatsapp-auth');

// Message retry counter cache outside socket to persist across reconnects
const msgRetryCounterCache = new NodeCache({ stdTTL: 86400, useClones: false });

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.currentQR = null;
    this.connectedPhone = null;
    this.pushName = null;
    this.syncTimeout = null;
    this.isInitializing = false;
    // In-memory message store for instant retry responses
    this.messageStore = new NodeCache({ stdTTL: 604800, maxKeys: 1000, useClones: false });
  }

  // Ensure local auth directory exists
  ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
  }

  // Restore auth files from MongoDB if local directory is empty (e.g. after Render restart)
  async restoreAuthFromMongo() {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.log('[WhatsApp] MongoDB not ready yet; skipping auth restore.');
        return;
      }
      this.ensureAuthDir();
      const files = fs.readdirSync(AUTH_DIR);
      if (files.length === 0) {
        console.log('[WhatsApp] Local auth dir empty. Restoring session from MongoDB Atlas...');
        const storedSessions = await WhatsAppSession.find({});
        for (const item of storedSessions) {
          const filePath = path.join(AUTH_DIR, item.key);
          fs.writeFileSync(filePath, item.data, 'utf-8');
        }
        if (storedSessions.length > 0) {
          console.log(`[WhatsApp] Restored ${storedSessions.length} auth files from MongoDB.`);
        }
      }
    } catch (err) {
      console.error('[WhatsApp] Error restoring auth from MongoDB:', err.message);
    }
  }

  // Persist current auth files to MongoDB
  async syncAuthToMongo() {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(async () => {
      try {
        if (mongoose.connection.readyState !== 1 || !fs.existsSync(AUTH_DIR)) return;
        const files = fs.readdirSync(AUTH_DIR);
        for (const file of files) {
          const filePath = path.join(AUTH_DIR, file);
          if (fs.statSync(filePath).isFile()) {
            const data = fs.readFileSync(filePath, 'utf-8');
            await WhatsAppSession.findOneAndUpdate(
              { key: file },
              { key: file, data, updatedAt: new Date() },
              { upsert: true }
            );
          }
        }
        console.log(`[WhatsApp] Synced ${files.length} auth files to MongoDB Atlas.`);
      } catch (err) {
        console.error('[WhatsApp] Error syncing auth to MongoDB:', err.message);
      }
    }, 1200);
  }

  // Initialize or re-initialize Baileys connection
  async init() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      this.status = 'connecting';
      await this.restoreAuthFromMongo();
      this.ensureAuthDir();

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760] }));
      const logger = pino({ level: 'silent' });

      // Automatically sync auth to Mongo whenever keys are added or updated
      const originalKeysSet = state.keys.set;
      state.keys.set = async (data) => {
        await originalKeysSet(data);
        this.syncAuthToMongo();
      };

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        msgRetryCounterCache,
        // Crucial handler: Fulfills WhatsApp's retry requests so messages decrypt on phones
        getMessage: async (key) => {
          if (key?.id) {
            // 1. Try memory cache
            const memMsg = this.messageStore.get(key.id);
            if (memMsg) {
              console.log(`[WhatsApp] getMessage: Serving message ${key.id} from in-memory cache.`);
              return memMsg;
            }

            // 2. Try MongoDB Atlas store
            try {
              const stored = await WhatsAppMessage.findOne({ messageId: key.id });
              if (stored && stored.messageBase64) {
                const decoded = proto.Message.decode(Buffer.from(stored.messageBase64, 'base64'));
                this.messageStore.set(key.id, decoded);
                console.log(`[WhatsApp] getMessage: Restored message ${key.id} from MongoDB Atlas.`);
                return decoded;
              }
            } catch (dbErr) {
              console.error(`[WhatsApp] Error retrieving message ${key.id} from MongoDB:`, dbErr.message);
            }
          }
          console.warn(`[WhatsApp] getMessage: Message not found for key:`, key);
          return undefined;
        },
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000
      });

      // Save credentials event
      this.sock.ev.on('creds.update', async () => {
        await saveCreds();
        this.syncAuthToMongo();
      });

      // Connection update event
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.currentQR = await qrcode.toDataURL(qr, {
              margin: 2,
              scale: 8,
              color: {
                dark: '#0B5240',
                light: '#FFFFFF'
              }
            });
            this.status = 'qr_ready';
            console.log('[WhatsApp] Active QR code generated and ready for pairing.');
          } catch (qrErr) {
            console.error('[WhatsApp] Error generating QR data URL:', qrErr);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`[WhatsApp] Connection closed (status: ${statusCode}, reconnect: ${shouldReconnect})`);

          if (statusCode === DisconnectReason.loggedOut) {
            this.status = 'disconnected';
            this.currentQR = null;
            this.connectedPhone = null;
            this.pushName = null;
            await this.clearAuth();
            setTimeout(() => {
              this.isInitializing = false;
              this.init();
            }, 3000);
          } else {
            this.status = 'connecting';
            setTimeout(() => {
              this.isInitializing = false;
              this.init();
            }, 5000);
          }
        } else if (connection === 'open') {
          this.status = 'connected';
          this.currentQR = null;

          const rawId = this.sock.user?.id || '';
          this.connectedPhone = rawId.split(':')[0] || rawId.split('@')[0];
          this.pushName = this.sock.user?.name || this.sock.user?.verifiedName || 'Sri Sai Durga Diagnostics';

          console.log(`[WhatsApp] Successfully connected! Phone: ${this.connectedPhone}, Name: ${this.pushName}`);
          this.syncAuthToMongo();
        }
      });
    } catch (err) {
      console.error('[WhatsApp] Initialization error:', err);
      this.status = 'disconnected';
    } finally {
      this.isInitializing = false;
    }
  }

  // Clear local and MongoDB auth storage
  async clearAuth() {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      if (mongoose.connection.readyState === 1) {
        await WhatsAppSession.deleteMany({});
        await WhatsAppMessage.deleteMany({});
      }
      this.messageStore.flushAll();
      console.log('[WhatsApp] Auth files, sessions, and message caches wiped.');
    } catch (err) {
      console.error('[WhatsApp] Error clearing auth:', err.message);
    }
  }

  // Disconnect & unpair device
  async disconnect() {
    try {
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch (e) {
          this.sock.end(new Error('Manual disconnect'));
        }
      }
    } catch (err) {
      console.error('[WhatsApp] Error logging out socket:', err.message);
    }
    await this.clearAuth();
    this.status = 'disconnected';
    this.currentQR = null;
    this.connectedPhone = null;
    this.pushName = null;

    setTimeout(() => {
      this.init();
    }, 2000);
    return { success: true, message: 'WhatsApp unlinked successfully. Ready to scan new QR.' };
  }

  // Normalize phone number to Baileys format: `${clean}@s.whatsapp.net`
  normalizeJid(phone) {
    if (!phone) throw new Error('Phone number is required');
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = clean.replace(/^0+/, '');
    }
    // Prefix 91 for Indian 10-digit mobile numbers
    if (clean.length === 10) {
      clean = '91' + clean;
    }
    if (clean.length < 10 || clean.length > 15) {
      throw new Error(`Invalid phone number: ${phone}. Please enter a valid mobile number.`);
    }
    return jidNormalizedUser(`${clean}@s.whatsapp.net`);
  }

  // Send PDF document to a recipient
  async sendPdfDocument(phone, pdfBufferOrBase64, fileName = 'Report.pdf', caption = '') {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error('WhatsApp is not connected. Please scan the QR code to link your WhatsApp account.');
    }

    let jid = this.normalizeJid(phone);

    // Verify on WhatsApp: strictly resolve canonical @s.whatsapp.net user JID (avoid raw @lid)
    try {
      const existsResult = await this.sock.onWhatsApp(jid);
      if (Array.isArray(existsResult) && existsResult.length > 0) {
        const target = existsResult[0];
        if (target && target.exists && target.jid && target.jid.endsWith('@s.whatsapp.net')) {
          jid = jidNormalizedUser(target.jid);
        }
      }
    } catch (verifyErr) {
      console.warn('[WhatsApp] onWhatsApp verification check warning:', verifyErr.message);
    }

    let pdfBuffer;
    if (Buffer.isBuffer(pdfBufferOrBase64)) {
      pdfBuffer = pdfBufferOrBase64;
    } else if (typeof pdfBufferOrBase64 === 'string') {
      const base64Data = pdfBufferOrBase64.replace(/^data:application\/pdf;base64,/, '');
      pdfBuffer = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error('Invalid PDF document data');
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF document is empty');
    }

    const safeFileName = (fileName || 'Report.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFileName = safeFileName.endsWith('.pdf') ? safeFileName : `${safeFileName}.pdf`;

    console.log(`[WhatsApp] Sending PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB) to ${jid}...`);

    const result = await this.sock.sendMessage(jid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName: finalFileName,
      caption: caption || 'Your medical test report from Sri Sai Durga Diagnostics.'
    });

    // 1. Cache message in memory for immediate retry requests
    if (result?.key?.id && result?.message) {
      this.messageStore.set(result.key.id, result.message);

      // 2. Persist binary protobuf message in MongoDB Atlas (survives Render restarts)
      try {
        const rawBytes = proto.Message.encode(result.message).finish();
        await WhatsAppMessage.findOneAndUpdate(
          { messageId: result.key.id },
          {
            messageId: result.key.id,
            remoteJid: jid,
            messageBase64: Buffer.from(rawBytes).toString('base64'),
            createdAt: new Date()
          },
          { upsert: true }
        );
        console.log(`[WhatsApp] Persisted message ${result.key.id} in MongoDB for E2EE retries.`);
      } catch (dbErr) {
        console.error('[WhatsApp] Failed to persist message in MongoDB:', dbErr.message);
      }
    }

    this.syncAuthToMongo();

    console.log(`[WhatsApp] PDF sent successfully! Message ID: ${result?.key?.id}`);
    return {
      success: true,
      messageId: result?.key?.id,
      recipient: jid,
      fileName: finalFileName
    };
  }

  // Get current connection status and pairing QR
  getStatus() {
    return {
      status: this.status,
      connected: this.status === 'connected',
      phone: this.connectedPhone,
      pushName: this.pushName,
      qr: this.currentQR
    };
  }
}

// Export singleton instance
const whatsappService = new WhatsAppService();
module.exports = whatsappService;
