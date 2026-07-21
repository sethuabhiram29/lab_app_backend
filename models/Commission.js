const mongoose = require('mongoose');

const CommissionSchema = new mongoose.Schema({
  patientEntry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

// Add an index for faster queries by date
CommissionSchema.index({ date: 1 });

module.exports = mongoose.model('Commission', CommissionSchema);
