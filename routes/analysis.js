const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');

// @route   GET api/analysis/doctor
// @desc    Get patient entries referred by a specific doctor in a date range
// @access  Private
router.get('/doctor', auth, async (req, res) => {
  try {
    const { doctorId, startDate, endDate } = req.query;
    
    // Validate required parameters
    if (!doctorId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters: doctorId, startDate, and endDate are required'
      });
    }

    // Parse and validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format. Please use valid date strings'
      });
    }

    // Set end date to end of day to include entire day
    end.setHours(23, 59, 59, 999);

    const query = {
      refDoctor: doctorId,
      sampleCollectionDate: {
        $gte: start,
        $lte: end,
      },
    };
    
    const patients = await Patient.find(query)
      .populate('refDoctor', 'name')
      .populate('refAgent', 'name')
      .populate('selectedTests.test', 'name price')
      .sort({ sampleCollectionDate: -1 })
      .lean(); // Use lean() for better performance

    if (!patients || patients.length === 0) {
      return res.json({
        patients: [],
        summary: {
          totalAmount: 0,
          totalCommission: 0,
          netAmount: 0
        }
      });
    }

    // Calculate summary using the new commission structure
    let totalAmount = 0;
    let totalCommission = 0;
    const testCounts = {};

    const patientsWithCommission = patients.map(patient => {
      const patientTotal = patient.totalAmount || 0;
      const commissionAmount = patient.commission || 0;
      
      totalAmount += patientTotal;
      totalCommission += commissionAmount;

      if (patient.selectedTests && Array.isArray(patient.selectedTests)) {
        patient.selectedTests.forEach(item => {
          if (item.test && item.test.name) {
            const testName = item.test.name;
            testCounts[testName] = (testCounts[testName] || 0) + 1;
          }
        });
      }

      return {
        ...patient,
        commission: commissionAmount,
        netAmount: patientTotal - commissionAmount
      };
    });

    const summary = {
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      netAmount: Math.round((totalAmount - totalCommission) * 100) / 100,
      testCounts
    };

    res.json({
      patients: patientsWithCommission,
      summary
    });

  } catch (err) {
    console.error('[Analysis/doctor] Error:', err.message);
    res.status(500).json({
      error: 'Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// @route   GET api/analysis/agent
// @desc    Get patient entries referred by a specific agent in a date range
// @access  Private
router.get('/agent', auth, async (req, res) => {
  try {
    const { agentId, startDate, endDate } = req.query;
    
    // Validate required parameters
    if (!agentId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters: agentId, startDate, and endDate are required'
      });
    }

    // Parse and validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format. Please use valid date strings'
      });
    }

    // Set end date to end of day to include entire day
    end.setHours(23, 59, 59, 999);

    const query = {
      refAgent: agentId,
      sampleCollectionDate: {
        $gte: start,
        $lte: end,
      },
    };
    
    const patients = await Patient.find(query)
      .populate('refDoctor', 'name')
      .populate('refAgent', 'name')
      .populate('selectedTests.test', 'name price')
      .sort({ sampleCollectionDate: -1 })
      .lean(); // Use lean() for better performance

    if (!patients || patients.length === 0) {
      return res.json({
        patients: [],
        summary: {
          totalAmount: 0,
          totalCommission: 0,
          netAmount: 0
        }
      });
    }

    // Calculate summary using the new commission structure
    let totalAmount = 0;
    let totalCommission = 0;
    const testCounts = {};

    const patientsWithCommission = patients.map(patient => {
      const patientTotal = patient.totalAmount || 0;
      const commissionAmount = patient.commission || 0;
      
      totalAmount += patientTotal;
      totalCommission += commissionAmount;

      if (patient.selectedTests && Array.isArray(patient.selectedTests)) {
        patient.selectedTests.forEach(item => {
          if (item.test && item.test.name) {
            const testName = item.test.name;
            testCounts[testName] = (testCounts[testName] || 0) + 1;
          }
        });
      }

      return {
        ...patient,
        commission: commissionAmount,
        netAmount: patientTotal - commissionAmount
      };
    });

    const summary = {
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      netAmount: Math.round((totalAmount - totalCommission) * 100) / 100,
      testCounts
    };

    res.json({
      patients: patientsWithCommission,
      summary
    });

  } catch (err) {
    console.error('[Analysis/agent] Error:', err.message);
    res.status(500).json({
      error: 'Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

module.exports = router;
