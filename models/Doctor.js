const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialization: { type: String, required: true },
  contact: { type: String, default: '' },
  email: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Doctor', DoctorSchema); 