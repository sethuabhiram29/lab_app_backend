const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');
const Counter = require('../models/Counter');
const { decreaseStockForTest } = require('../utils/equipmentUtils');

// @route   GET api/patients
// @desc    Get all patients
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const patients = await Patient.find()
      .populate('refDoctor', 'name specialization')
      .populate('refAgent', 'name')
      .populate('selectedTests.test')
      .sort({ createdAt: -1 });
    res.json(patients);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/patients/pending-reports
// @desc    Get patients with pending reports
// @access  Private
router.get('/pending-reports', auth, async (req, res) => {
  try {
    const patients = await Patient.find({ reportStatus: 'pending' })
      .populate('refDoctor', 'name specialization')
      .populate('refAgent', 'name')
      .populate('selectedTests.test')
      .sort({ createdAt: -1 });
    res.json(patients);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/patients/:id
// @desc    Get patient by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('refDoctor', 'name specialization')
      .populate('refAgent', 'name')
      .populate('selectedTests.test')
      .populate('selectedTests.parameters');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json(patient);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/patients
// @desc    Create a patient
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    console.log('Received patient data:', JSON.stringify(req.body, null, 2));

    const {
      name,
      age,
      gender,
      mobileNumber,
      sampleCollectionDate,
      refDoctor,
      refAgent,
      totalAmount,
      advancePaid,
      selectedTests
    } = req.body;

    // Basic validation
    console.log('Validation check - name:', name, 'age:', age, 'gender:', gender, 'totalAmount:', totalAmount);
    if (!name || !age || !gender || totalAmount === undefined || totalAmount === null) {
      console.log('Missing required fields:', { name, age, gender, totalAmount });
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    // Validate selected tests
    if (!Array.isArray(selectedTests) || selectedTests.length === 0) {
      console.log('Invalid or empty selected tests:', selectedTests);
      return res.status(400).json({ message: 'At least one test must be selected' });
    }

    // Validate each test has required fields
    for (const test of selectedTests) {
      console.log('Validating test:', test);
      if (!test.test || !test.subtests || !Array.isArray(test.subtests)) {
        console.log('Invalid test structure:', test);
        return res.status(400).json({ 
          message: 'Invalid test structure. Each test must have a test ID and subtests' 
        });
      }
    }

    // Get next regNo atomically
    let regNo;
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'patientRegNo' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      regNo = counter.seq;
    } catch (err) {
      console.error('Error generating regNo:', err);
      return res.status(500).json({ message: 'Failed to generate registration number' });
    }

    const newPatient = new Patient({
      name,
      age: Number(age),
      gender,
      mobileNumber: mobileNumber || ' ',
      sampleCollectionDate: sampleCollectionDate || new Date(),
      refDoctor: refDoctor || null,
      refAgent: refAgent || null,
      totalAmount: Number(totalAmount),
      advancePaid: Number(advancePaid) || 0,
      dueAmount: Number(totalAmount) - (Number(advancePaid) || 0),
      selectedTests: selectedTests.map(test => ({
        test: test.test,
        subtests: test.subtests,
        packs: test.packs || []
      })),
      regNo
    });

    console.log('Creating new patient:', JSON.stringify(newPatient, null, 2));

    const patient = await newPatient.save();
    console.log('Patient saved successfully:', JSON.stringify(patient, null, 2));
    
  
    // Decrease equipment stock for each test
    const stockErrors = [];
    console.log('Processing selected tests for stock decrease:', selectedTests);
    
    for (const testEntry of selectedTests) {
        try {
            console.log('Processing test entry:', testEntry.test);
            const success = await decreaseStockForTest(testEntry.test);
            
            if (!success) {
                stockErrors.push(`No available stock found for test ID: ${testEntry.test}`);
            }
        } catch (stockError) {
            console.error('Error updating equipment stock:', stockError);
            stockErrors.push(`Failed to update stock for test ID ${testEntry.test}: ${stockError.message}`);
        }
    }
    
    // Add stock errors to response if any occurred
    if (stockErrors.length > 0) {
        console.warn('Stock decrease warnings:', stockErrors);
    }

    // Populate the saved patient with references
    const populatedPatient = await Patient.findById(patient._id)
      .populate('refDoctor', 'name specialization')
      .populate('refAgent', 'name')
      .populate('selectedTests.test')
      .populate('selectedTests.parameters');

    console.log('Populated patient:', JSON.stringify(populatedPatient, null, 2));
    res.json(populatedPatient);
  } catch (err) {
    console.error('Error creating patient:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      message: 'Failed to create patient entry',
      error: err.message 
    });
  }
});

// @route   PUT api/patients/:id
// @desc    Update a patient
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Handle payment updates specifically
    if (req.body.advancePaid !== undefined) {
      const newAdvancePaid = Number(req.body.advancePaid);
      const newDueAmount = patient.totalAmount - newAdvancePaid;
      
      // Update the request body with calculated due amount
      req.body.dueAmount = newDueAmount;
      
      console.log('Payment update:', {
        patientId: req.params.id,
        oldAdvancePaid: patient.advancePaid,
        newAdvancePaid: newAdvancePaid,
        totalAmount: patient.totalAmount,
        newDueAmount: newDueAmount
      });
    }

    patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    )
    .populate('refDoctor', 'name specialization')
    .populate('refAgent', 'name')
    .populate('selectedTests.test')
    .populate('selectedTests.parameters');

    res.json(patient);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router; 