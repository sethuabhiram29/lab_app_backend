const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const whatsappService = require('../services/whatsappService');
const Report = require('../models/Report');
const Patient = require('../models/Patient');

// @route   GET api/whatsapp/status
// @desc    Get WhatsApp connection status and pairing QR code if available
// @access  Private
router.get('/status', auth, (req, res) => {
  try {
    const status = whatsappService.getStatus();
    res.json(status);
  } catch (err) {
    console.error('Error fetching WhatsApp status:', err);
    res.status(500).json({ message: 'Failed to fetch WhatsApp status', error: err.message });
  }
});

// @route   GET api/whatsapp/qr
// @desc    Get pairing QR code data URL
// @access  Private
router.get('/qr', auth, (req, res) => {
  try {
    const { qr, status, connected } = whatsappService.getStatus();
    res.json({ qr, status, connected });
  } catch (err) {
    console.error('Error fetching WhatsApp QR:', err);
    res.status(500).json({ message: 'Failed to fetch WhatsApp QR', error: err.message });
  }
});

// @route   POST api/whatsapp/send-report
// @desc    Send PDF test report via WhatsApp to patient, doctor, or custom number
// @access  Private
router.post('/send-report', auth, async (req, res) => {
  try {
    const { recipientType, phone, reportId, pdfBase64, fileName, caption } = req.body;

    let targetPhone = phone;
    let targetFileName = fileName || 'Test_Report.pdf';
    let targetCaption = caption;

    // If reportId provided, we can auto-resolve recipient details if phone was missing
    let report = null;
    if (reportId) {
      report = await Report.findById(reportId).populate({
        path: 'patient',
        populate: { path: 'refDoctor' }
      });
    }

    if (!targetPhone && report) {
      if (recipientType === 'doctor') {
        targetPhone = report.patient?.refDoctor?.contact || '';
      } else {
        targetPhone = report.patient?.mobileNumber || '';
      }
    }

    if (!targetPhone) {
      return res.status(400).json({ message: 'Recipient phone number is required' });
    }

    if (!pdfBase64) {
      return res.status(400).json({ message: 'PDF document content (pdfBase64) is required' });
    }

    // Default friendly caption if none provided
    if (!targetCaption) {
      const patientName = report?.patient?.name || report?.reportDisplayData?.patient?.name || 'Patient';
      targetCaption = `Dear ${patientName},\n\nYour medical diagnostic test report from *Sri Sai Durga Diagnostics* is attached herewith.\n\nThank you for choosing Sri Sai Durga Diagnostics.`;
    }

    // Send PDF document via Baileys
    const result = await whatsappService.sendPdfDocument(
      targetPhone,
      pdfBase64,
      targetFileName,
      targetCaption
    );

    // If reportId exists, record that WhatsApp was sent
    if (report) {
      if (!report.sharedVia) {
        report.sharedVia = [];
      }
      report.sharedVia.push({
        method: 'whatsapp',
        recipientType: recipientType || 'custom',
        recipientPhone: targetPhone,
        sentAt: new Date(),
        sentBy: req.user?.id
      });
      await report.save();
    }

    res.json({
      message: 'Report PDF sent successfully via WhatsApp',
      result
    });

  } catch (err) {
    console.error('Error sending WhatsApp report:', err);
    res.status(500).json({
      message: err.message || 'Failed to send WhatsApp message',
      error: err.message
    });
  }
});

// @route   POST api/whatsapp/disconnect
// @desc    Unlink current WhatsApp account and wipe session
// @access  Private
router.post('/disconnect', auth, async (req, res) => {
  try {
    const result = await whatsappService.disconnect();
    res.json(result);
  } catch (err) {
    console.error('Error disconnecting WhatsApp:', err);
    res.status(500).json({ message: 'Failed to disconnect WhatsApp', error: err.message });
  }
});

// @route   POST api/whatsapp/reconnect
// @desc    Restart WhatsApp connection / refresh QR
// @access  Private
router.post('/reconnect', auth, async (req, res) => {
  try {
    await whatsappService.init();
    res.json({ message: 'WhatsApp reconnected / refreshed', status: whatsappService.getStatus() });
  } catch (err) {
    console.error('Error reconnecting WhatsApp:', err);
    res.status(500).json({ message: 'Failed to reconnect WhatsApp', error: err.message });
  }
});

module.exports = router;
