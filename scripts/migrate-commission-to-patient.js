const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Commission = require('../models/Commission');

async function migrateCommissions() {
  try {
    console.log('Starting commission migration...');
    
    // Get all commissions
    const commissions = await Commission.find().lean();
    console.log(`Found ${commissions.length} commissions to migrate`);

    for (const comm of commissions) {
      // Update patient
      const patient = await Patient.findById(comm.patientEntry);
      if (patient) {
        // Store old commission in history if it exists
        if (patient.commission) {
          if (!patient.commissionHistory) patient.commissionHistory = [];
          patient.commissionHistory.push({
            amount: patient.commission,
            notes: patient.commissionNotes || '',
            date: patient.commissionUpdatedAt || new Date()
          });
        }

        // Set new commission
        patient.commission = comm.amount;
        patient.commissionNotes = comm.notes || '';
        patient.commissionUpdatedAt = comm.date || comm.createdAt || new Date();
        
        await patient.save();
        console.log(`Updated commission for patient ${patient._id}`);
      }
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your_db_name')
  .then(() => migrateCommissions())
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
