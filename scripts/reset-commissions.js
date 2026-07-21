const mongoose = require('mongoose');
const Patient = require('../models/Patient');

async function resetCommissions() {
  try {
    console.log('Starting commission reset...');
    
    // Clean up and reset all commission data
    const result = await Patient.updateMany(
      {}, 
      { 
        $set: { 
          commission: 0,
          commissionNotes: '',
          commissionUpdatedAt: new Date()
        },
        $unset: {
          commissionHistory: 1,
          'commission.amount': 1,
          'commission.notes': 1,
          'commission.addedOn': 1
        }
      }
    );

    console.log(`Reset ${result.modifiedCount} patient commissions to zero`);
    console.log('Commission reset completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your_db_name')
  .then(() => resetCommissions())
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
