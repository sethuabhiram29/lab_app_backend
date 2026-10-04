const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Test = require('../models/Test');
const auth = require('../middleware/auth');

// Get all tests
router.get('/', auth, async (req, res) => {
  try {
    // Get all tests, both active and inactive
    const tests = await Test.find();
    console.log('Returning tests with formulas:', tests.map(t => ({
      name: t.name,
      isActive: t.isActive,
      subtests: t.subtests.map(s => ({
        name: s.name,
        formula: s.formula
      }))
    })));
    res.json(tests);
  } catch (err) {
    console.error('Error fetching tests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new test
router.post('/', [
  auth,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('code', 'Code is required').not().isEmpty(),
    check('subtests', 'Subtests must be an array').optional().isArray(),
    check('packs', 'Packs must be an array').optional().isArray(),
  ]
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, code, description, defaultNotes = '', image = '', subtests = [], packs = [] } = req.body;

    // Check if test code already exists (regardless of active status)
    const existingTest = await Test.findOne({ code: code.trim() });
    if (existingTest) {
      return res.status(400).json({ message: 'Test code already exists. Please use a different code.' });
    }

    // Validate subtests
    for (const sub of subtests) {
      if (!sub.name) {
        return res.status(400).json({ message: 'Each subtest must have a name' });
      }
    }

    // Validate packs and their subtests
    for (const pack of packs) {
      if (!pack.name || !Array.isArray(pack.subtests)) {
        return res.status(400).json({ message: 'Each pack must have a name and subtests array' });
      }
      for (const sub of pack.subtests) {
        if (!sub.name) {
          return res.status(400).json({ message: 'Each subtest in a pack must have a name' });
        }
      }
    }

    // Ensure boolean fields are properly set
    const requiresSeparatePage = req.body.requiresSeparatePage === true;
    const processedPacks = packs.map(pack => ({
      ...pack,
      defaultNotes: pack.defaultNotes ? pack.defaultNotes.trim() : '',
      requiresSeparatePage: pack.requiresSeparatePage === true
    }));

    console.log('Creating test with requiresSeparatePage:', requiresSeparatePage);
    console.log('Creating test with processedPacks:', JSON.stringify(processedPacks, null, 2));

    const test = new Test({
      name: name.trim(),
      code: code.trim(),
      description: description ? description.trim() : '',
      defaultNotes: defaultNotes ? defaultNotes.trim() : '',
      image,
      subtests,
      packs: processedPacks,
      requiresSeparatePage
    });

    const savedTest = await test.save();
    res.status(201).json(savedTest);
  } catch (err) {
    console.error('Error creating test:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Test code already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a test
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, code, description, defaultNotes = '', image = '', subtests = [], packs = [], requiresSeparatePage = false } = req.body;

    console.log('Raw requiresSeparatePage value:', requiresSeparatePage, typeof requiresSeparatePage);
    console.log('Raw packs requiresSeparatePage values:', packs.map(p => ({ name: p.name, requiresSeparatePage: p.requiresSeparatePage, type: typeof p.requiresSeparatePage })));

    const processedRequiresSeparatePage = requiresSeparatePage === true || requiresSeparatePage === 'true';
    const processedPacks = packs.map(pack => ({
      ...pack,
      defaultNotes: pack.defaultNotes ? pack.defaultNotes.trim() : '',
      requiresSeparatePage: pack.requiresSeparatePage === true || pack.requiresSeparatePage === 'true'
    }));

    console.log('Update request body:', req.body);
    console.log('Processed requiresSeparatePage:', processedRequiresSeparatePage);
    console.log('Processed packs:', JSON.stringify(processedPacks, null, 2));

    // Check if new code conflicts
    if (code) {
      const existingTest = await Test.findOne({ 
        code, 
        _id: { $ne: req.params.id } 
      });
      if (existingTest) {
        return res.status(400).json({ message: 'Test code already exists' });
      }
    }

    // Validate subtests
    for (const sub of subtests) {
      if (!sub.name) {
        return res.status(400).json({ message: 'Each subtest must have a name' });
      }
    }
    // Validate packs
    for (const pack of packs) {
      if (!pack.name || !Array.isArray(pack.subtests)) {
        return res.status(400).json({ message: 'Each pack must have a name and subtests array' });
      }
      for (const sub of pack.subtests) {
        if (!sub.name) {
          return res.status(400).json({ message: 'Each subtest in a pack must have a name' });
        }
      }
    }

    console.log('Updating test with data:', JSON.stringify({
      name, code, description, defaultNotes, image,
      requiresSeparatePage: processedRequiresSeparatePage,
      subtests: subtests.map(s => ({
        name: s.name,
        formula: s.formula
      }))
    }, null, 2));

    const updatedTest = await Test.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name,
          code,
          description,
          defaultNotes: defaultNotes ? defaultNotes.trim() : '',
          image,
          requiresSeparatePage: processedRequiresSeparatePage,
          subtests: subtests.map(sub => ({
            name: sub.name,
            unit: sub.unit || '',
            reference: sub.reference || '',
            formula: sub.formula || '',
            result: sub.result || '',
            image: sub.image || ''
          })),
          packs: processedPacks.map(pack => ({
            name: pack.name,
            defaultNotes: pack.defaultNotes || '',
            image: pack.image || '',
            requiresSeparatePage: pack.requiresSeparatePage,
            subtests: (pack.subtests || []).map(sub => ({
              name: sub.name,
              unit: sub.unit || '',
              reference: sub.reference || '',
              formula: sub.formula || '',
              result: sub.result || '',
              image: sub.image || ''
            }))
          }))
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedTest) {
      return res.status(404).json({ message: 'Test not found' });
    }
    res.json(updatedTest);
  } catch (err) {
    console.error('Error updating test:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a test (hard delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    await Test.findByIdAndDelete(req.params.id);
    res.json({ message: 'Test deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a sub-test
router.post('/:id/subtests', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    const subtest = {
      name: req.body.name,
      unit: req.body.unit || '',
      reference: req.body.reference || '',
      result: req.body.result || '',
      image: req.body.image || ''
    };
    test.subtests.push(subtest);
    const updatedTest = await test.save();
    res.status(201).json(updatedTest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a sub-test
router.put('/:id/subtests/:subTestId', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    const subTest = test.subtests.id(req.params.subTestId);
    if (!subTest) {
      return res.status(404).json({ message: 'Sub-test not found' });
    }
    if (req.body.name) subTest.name = req.body.name;
    if (req.body.unit) subTest.unit = req.body.unit;
    if (req.body.reference) subTest.reference = req.body.reference;
    if (req.body.result) subTest.result = req.body.result;
    if (req.body.image) subTest.image = req.body.image;
    const updatedTest = await test.save();
    res.json(updatedTest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a sub-test (soft delete)
router.delete('/:id/subtests/:subTestId', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    const subTest = test.subtests.id(req.params.subTestId);
    if (!subTest) {
      return res.status(404).json({ message: 'Sub-test not found' });
    }
    subTest.isActive = false;
    await test.save();
    res.json({ message: 'Sub-test deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
