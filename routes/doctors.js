const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const auth = require('../middleware/auth');

// Get all active doctors
router.get('/', auth, async (req, res) => {
  try {
    const doctors = await Doctor.find({ isActive: true });
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new doctor
router.post('/', auth, async (req, res) => {
  try {
    const { name, specialization, contact, email } = req.body;
    const doctor = new Doctor({ name, specialization, contact, email });
    const savedDoctor = await doctor.save();
    res.status(201).json(savedDoctor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a doctor
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, specialization, contact, email } = req.body;
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    doctor.name = name;
    doctor.specialization = specialization;
    doctor.contact = contact || '';
    doctor.email = email || '';
    const updatedDoctor = await doctor.save();
    res.json(updatedDoctor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Soft delete a doctor
router.delete('/:id', auth, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    doctor.isActive = false;
    await doctor.save();
    res.json({ message: 'Doctor deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 