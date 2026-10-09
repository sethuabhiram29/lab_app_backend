const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const WhatsAppSession = require('../models/WhatsAppSession');

const AUTH_DIR = path.join(__dirname, '..', 'whatsapp-auth');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'qr_ready' | 'connecting' | 'connected'
    this.currentQR = null;
    this.connectedPhone = null;
    this.pushName = null;
    this.syncTimeout = null;
    this.isInitializing = false;
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
        console.log('[WhatsApp] MongoDB not connected yet, skipping auth restore.');
        return;
      }
      this.ensureAuthDir();
      const files = fs.readdirSync(AUTH_DIR);
      if (files.length === 0) {
        console.log('[WhatsApp] Local auth dir empty. Restoring from MongoDB Atlas...');
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
        console.log(`[WhatsApp] Synced ${files.length} auth files to MongoDB.`);
      } catch (err) {
        console.error('[WhatsApp] Error syncing auth to MongoDB:', err.message);
      }
    }, 1500);
  }

  // Initialize or re-initialize connection
  async init() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      this.status = 'connecting';
      await this.restoreAuthFromMongo();
      this.ensureAuthDir();

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      this.sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Sri Sai Durga Diagnostics', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false
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
            this.currentQR = await qrcode.toDataURL(qr, { margin: 2, scale: 8 });
            this.status = 'qr_ready';
            console.log('[WhatsApp] New QR code generated and ready for pairing.');
          } catch (qrErr) {
            console.error('[WhatsApp] Error generating QR data URL:', qrErr);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`[WhatsApp] Connection closed (code: ${statusCode}, shouldReconnect: ${shouldReconnect})`);

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
      }
      console.log('[WhatsApp] Auth files and database session wiped.');
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
    // Reinitialize to immediately generate fresh QR
    setTimeout(() => {
      this.init();
    }, 2000);
    return { success: true, message: 'WhatsApp unlinked successfully' };
  }

  // Normalize phone number to WhatsApp JID format
  normalizeJid(phone) {
    if (!phone) throw new Error('Phone number is required');
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = clean.replace(/^0+/, '');
    }
    // Auto-prefix Indian country code if standard 10-digit number
    if (clean.length === 10) {
      clean = '91' + clean;
    }
    if (clean.length < 10 || clean.length > 15) {
      throw new Error(`Invalid phone number length: ${phone}`);
    }
    return `${clean}@s.whatsapp.net`;
  }

  // Send PDF document to a recipient
  async sendPdfDocument(phone, pdfBufferOrBase64, fileName = 'Report.pdf', caption = '') {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error('WhatsApp is not connected. Please scan the QR code to link your WhatsApp account.');
    }

    const jid = this.normalizeJid(phone);

    let pdfBuffer;
    if (Buffer.isBuffer(pdfBufferOrBase64)) {
      pdfBuffer = pdfBufferOrBase64;
    } else if (typeof pdfBufferOrBase64 === 'string') {
      // Handle base64 data URI or pure base64
      const base64Data = pdfBufferOrBase64.replace(/^data:application\/pdf;base64,/, '');
      pdfBuffer = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error('Invalid PDF buffer provided');
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF document is empty');
    }

    const safeFileName = (fileName || 'Report.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');

    console.log(`[WhatsApp] Sending PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB) to ${jid}...`);

    const result = await this.sock.sendMessage(jid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName: safeFileName.endsWith('.pdf') ? safeFileName : `${safeFileName}.pdf`,
      caption: caption || 'Your medical test report from Sri Sai Durga Diagnostics.'
    });

    console.log(`[WhatsApp] PDF sent successfully! Message ID: ${result?.key?.id}`);
    return {
      success: true,
      messageId: result?.key?.id,
      recipient: jid,
      fileName: safeFileName
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
