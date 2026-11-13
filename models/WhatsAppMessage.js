const mongoose = require('mongoose');

const WhatsAppMessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  remoteJid: {
    type: String,
    required: true
  },
  messageBase64: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // Automatically expire after 7 days (TTL index)
  }
});

module.exports = mongoose.model('WhatsAppMessage', WhatsAppMessageSchema);
