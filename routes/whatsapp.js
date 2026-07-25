const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// POST /api/whatsapp/send-pdf
router.post('/send-pdf', async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const sandboxNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
    if (!accountSid || !authToken) {
      return res.status(500).json({ message: 'Twilio credentials are not configured.' });
    }

    const client = twilio(accountSid, authToken);
    const { phone, driveFileId, patientName } = req.body;

    if (!phone || !driveFileId) {
      return res.status(400).json({ message: 'Phone number and Drive File ID are required.' });
    }

    // Format the phone number (assuming India +91 if no country code provided)
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      // Default to India +91 for testing if not provided
      formattedPhone = '+91' + formattedPhone;
    }

    // Construct the Google Drive direct download URL
    // Twilio will fetch this URL and attach it as a PDF document
    const mediaUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}`;

    // Send the WhatsApp message
    const message = await client.messages.create({
      from: sandboxNumber,
      to: `whatsapp:${formattedPhone}`,
      body: `Hello ${patientName || 'Patient'},\n\nHere is your medical diagnostic report.`,
      mediaUrl: [mediaUrl]
    });

    console.log(`WhatsApp message sent! SID: ${message.sid}`);
    res.status(200).json({ success: true, messageId: message.sid });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({ message: 'Failed to send WhatsApp message.', error: error.message });
  }
});

module.exports = router;
