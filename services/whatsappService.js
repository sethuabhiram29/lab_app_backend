const { create, ev } = require('@open-wa/wa-automate');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const SESSION_DATA_DIR = path.join(__dirname, '..', '.open-wa-session');
const SESSION_ID = 'LAB_WHATSAPP_SESSION';

class WhatsAppService {
  constructor() {
    this.client = null;
    this.status = 'disconnected'; // 'disconnected' | 'qr_ready' | 'connecting' | 'connected'
    this.currentQR = null;
    this.connectedPhone = null;
    this.pushName = null;
    this.isInitializing = false;
    this.qrListenerRegistered = false;

    this.registerQRListener();
  }

  // Ensure session directory exists
  ensureSessionDir() {
    if (!fs.existsSync(SESSION_DATA_DIR)) {
      fs.mkdirSync(SESSION_DATA_DIR, { recursive: true });
    }
  }

  // Register global QR event listener from Open-WA
  registerQRListener() {
    if (this.qrListenerRegistered) return;
    this.qrListenerRegistered = true;

    ev.on('qr.**', async (rawQr, sessionId) => {
      try {
        console.log(`[WhatsApp-OpenWA] QR Code received for session: ${sessionId}`);
        if (!rawQr) return;

        if (typeof rawQr === 'string' && rawQr.startsWith('data:image/')) {
          this.currentQR = rawQr;
        } else {
          // Convert string / URL to Data URL for frontend img tag
          this.currentQR = await qrcode.toDataURL(String(rawQr), {
            margin: 2,
            scale: 8,
            color: {
              dark: '#0B5240',
              light: '#FFFFFF'
            }
          });
        }
        this.status = 'qr_ready';
        console.log('[WhatsApp-OpenWA] QR Code ready for user pairing in UI.');
      } catch (err) {
        console.error('[WhatsApp-OpenWA] Error processing QR event:', err.message);
      }
    });
  }

  // Initialize Open-WA client
  async init() {
    if (this.isInitializing) {
      console.log('[WhatsApp-OpenWA] Client is already initializing. Skipping duplicate call.');
      return;
    }
    if (this.client && this.status === 'connected') {
      console.log('[WhatsApp-OpenWA] Client is already connected.');
      return;
    }

    this.isInitializing = true;
    this.status = 'connecting';
    this.ensureSessionDir();

    try {
      console.log('[WhatsApp-OpenWA] Starting Open-WA client instance...');

      const client = await create({
        sessionId: SESSION_ID,
        userDataDir: SESSION_DATA_DIR,
        useChrome: true,
        headless: true,
        qrTimeout: 0,
        authTimeout: 0,
        autoRefresh: true,
        qrRefreshS: 25,
        killProcessOnBrowserClose: false,
        killProcessOnTimeout: false,
        restartOnCrash: true,
        disableSpins: true,
        blockCrashLogs: true,
        eventMode: true,
        chromiumArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run'
        ]
      });

      this.client = client;
      this.status = 'connected';
      this.currentQR = null;

      // Extract host phone number and lab name
      try {
        const hostNumber = await client.getHostNumber().catch(() => null);
        this.connectedPhone = hostNumber ? String(hostNumber).replace(/\D/g, '') : 'Active';
      } catch (e) {
        this.connectedPhone = 'Active';
      }
      this.pushName = 'Sri Sai Durga Diagnostics';

      console.log(`[WhatsApp-OpenWA] Successfully connected! Phone: ${this.connectedPhone}`);

      // Handle disconnect / logout events
      client.onLogout(async () => {
        console.log('[WhatsApp-OpenWA] User logged out from WhatsApp on phone.');
        await this.handleLogout();
      });

      if (typeof client.onStateChanged === 'function') {
        client.onStateChanged(async (state) => {
          console.log(`[WhatsApp-OpenWA] Connection state changed: ${state}`);
          if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
            this.status = 'disconnected';
          } else if (state === 'CONNECTED') {
            this.status = 'connected';
          }
        });
      }

    } catch (err) {
      console.error('[WhatsApp-OpenWA] Initialization error:', err.message);
      this.status = 'disconnected';
    } finally {
      this.isInitializing = false;
    }
  }

  // Handle logout from device
  async handleLogout() {
    this.client = null;
    this.status = 'disconnected';
    this.currentQR = null;
    this.connectedPhone = null;
    this.pushName = null;
    this.isInitializing = false;

    try {
      if (fs.existsSync(SESSION_DATA_DIR)) {
        fs.rmSync(SESSION_DATA_DIR, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('[WhatsApp-OpenWA] Error clearing session dir on logout:', e.message);
    }

    // Auto restart to generate fresh QR
    setTimeout(() => {
      this.init();
    }, 3000);
  }

  // Manual disconnect & unpair device
  async disconnect() {
    try {
      if (this.client) {
        try {
          if (typeof this.client.stop === 'function') {
            await this.client.stop('LOGGED_OUT');
          }
        } catch (e) {
          console.error('[WhatsApp-OpenWA] Error stopping client:', e.message);
        }
      }
    } catch (err) {
      console.error('[WhatsApp-OpenWA] Error in disconnect:', err.message);
    }

    return await this.handleLogout();
  }

  // Normalize phone number to WhatsApp Open-WA format: `${number}@c.us`
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
    return `${clean}@c.us`;
  }

  // Send PDF document directly to recipient
  async sendPdfDocument(phone, pdfBufferOrBase64, fileName = 'Report.pdf', caption = '') {
    if (this.status !== 'connected' || !this.client) {
      throw new Error('WhatsApp is not connected. Please scan the QR code to link your WhatsApp account.');
    }

    const jid = this.normalizeJid(phone);

    let dataUrl;
    if (Buffer.isBuffer(pdfBufferOrBase64)) {
      dataUrl = `data:application/pdf;base64,${pdfBufferOrBase64.toString('base64')}`;
    } else if (typeof pdfBufferOrBase64 === 'string') {
      if (pdfBufferOrBase64.startsWith('data:')) {
        dataUrl = pdfBufferOrBase64;
      } else {
        dataUrl = `data:application/pdf;base64,${pdfBufferOrBase64}`;
      }
    } else {
      throw new Error('Invalid PDF data provided');
    }

    const safeFileName = (fileName || 'Report.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFileName = safeFileName.endsWith('.pdf') ? safeFileName : `${safeFileName}.pdf`;

    console.log(`[WhatsApp-OpenWA] Sending PDF report (${finalFileName}) to ${jid}...`);

    const result = await this.client.sendFile(jid, dataUrl, finalFileName, {
      caption: caption || 'Your medical test report from Sri Sai Durga Diagnostics.'
    });

    console.log(`[WhatsApp-OpenWA] PDF successfully sent to ${jid}`);
    return {
      success: true,
      messageId: result?._serialized || result?.id || result || 'SENT',
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
