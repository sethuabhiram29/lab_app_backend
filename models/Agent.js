const mongoose = require('mongoose');

const AgentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialization: { type: String, required: true },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Agent', AgentSchema); 