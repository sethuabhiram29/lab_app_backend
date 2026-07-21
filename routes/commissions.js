const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Patient = require('../models/Patient');

// @route    GET /api/commissions
// @desc     Get commissions for a date range
// @access   Private
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    // Find all patients with commission for the date range
    const patients = await Patient.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).populate('refDoctor', 'name');

    res.json({
      success: true,
      data: patients
    });
  } catch (error) {
    console.error('Error fetching commissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route    POST /api/commissions/:patientId
// @desc     Update commission for a patient
// @access   Private
router.post('/:patientId', auth, async (req, res) => {
  try {
    const { commission } = req.body;
    const { patientId } = req.params;

    if (typeof commission !== 'number' || commission < 0) {
      return res.status(400).json({ message: 'Invalid commission amount' });
    }

    const patient = await Patient.findByIdAndUpdate(
      patientId,
      { commission },
      { new: true }
    ).select('name age gender totalAmount commission refDoctor createdAt');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json({
      success: true,
      data: patient
    });
  } catch (error) {
    console.error('Error updating commission:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
