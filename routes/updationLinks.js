const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');

// Get all patients with updation links
router.get('/', async (req, res) => {
  try {
    const patients = await Patient.find({ 'updationLinks.viewLink': { $exists: true } })
      .select('updationLinks');
    
    const updationLinks = patients.map(patient => ({
      patientId: patient._id,
      ...patient.updationLinks
    }));
    
    res.json({ success: true, updationLinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get updation links for a specific patient
router.get('/:patientId', async (req, res) => {
  const { patientId } = req.params;
  try {
    const patient = await Patient.findById(patientId).select('updationLinks');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ success: true, updationLinks: patient.updationLinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save or update updation links for a patient
router.post('/:patientId', async (req, res) => {
  const { patientId } = req.params;
  const { viewLink, downloadLink, updatedAt, patientName } = req.body;

  try {
    const patient = await Patient.findByIdAndUpdate(
      patientId,
      {
        updationLinks: { viewLink, downloadLink, updatedAt, patientName }
      },
      { new: true, upsert: false }
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ success: true, updationLinks: patient.updationLinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
