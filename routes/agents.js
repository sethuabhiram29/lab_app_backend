const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const auth = require('../middleware/auth');

// Get all active agents
router.get('/', auth, async (req, res) => {
  try {
    const agents = await Agent.find({ isActive: true });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new agent
router.post('/', auth, async (req, res) => {
  try {
    const { name, specialization } = req.body;
    const agent = new Agent({ name, specialization });
    const savedAgent = await agent.save();
    res.status(201).json(savedAgent);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update an agent
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, specialization } = req.body;
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    agent.name = name;
    agent.specialization = specialization;
    const updatedAgent = await agent.save();
    res.json(updatedAgent);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Soft delete an agent
router.delete('/:id', auth, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    agent.isActive = false;
    await agent.save();
    res.json({ message: 'Agent deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 