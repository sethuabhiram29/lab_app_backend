const express = require('express');
const router = express.Router();
const SubTest = require('../models/SubTest');

// Get all subtests
router.get('/', async (req, res) => {
  try {
    const subtests = await SubTest.find();
    res.json(subtests);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch subtests' });
  }
});

// Create a subtest
router.post('/', async (req, res) => {
  try {
    const { name, unit, range } = req.body;
    if (!name || !unit || !range) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const subtest = new SubTest({ name, unit, range });
    await subtest.save();
    res.json(subtest);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create subtest' });
  }
});

// Update a subtest
router.put('/:id', async (req, res) => {
  try {
    const { name, unit, range } = req.body;
    const subtest = await SubTest.findByIdAndUpdate(
      req.params.id,
      { name, unit, range },
      { new: true }
    );
    res.json(subtest);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update subtest' });
  }
});

// Delete a subtest
router.delete('/:id', async (req, res) => {
  try {
    await SubTest.findByIdAndDelete(req.params.id);
    res.json({ message: 'SubTest deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete subtest' });
  }
});

module.exports = router; 