const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Equipment = require('../models/Equipment');
const Test = require('../models/Test');
const auth = require('../middleware/auth');

// @route   GET api/equipment
// @desc    Get all equipment
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const equipment = await Equipment.find({ isActive: true })
      .populate({
        path: 'tests.test',
        select: 'name code price'
      })
      .sort({ name: 1 })
      .lean();

    // Add computed fields
    const equipmentWithStatus = equipment.map(item => ({
      ...item,
      status: item.currentStock <= item.minimumStock 
        ? item.currentStock === 0 ? 'out_of_stock' : 'low_stock'
        : 'in_stock'
    }));

    res.json(equipmentWithStatus);
  } catch (err) {
    console.error('Error fetching equipment:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/equipment/analytics
// @desc    Get equipment analytics
// @access  Private
router.get('/analytics', auth, async (req, res) => {
  try {
    const equipment = await Equipment.find({ isActive: true });
    
    const analytics = {
      totalEquipment: equipment.length,
      lowStockItems: equipment.filter(item => {
        // Check if isLowStock method exists, otherwise check manually
        if (typeof item.isLowStock === 'function') {
          return item.isLowStock();
        }
        // Fallback: consider low stock if current stock <= minimum stock
        return item.currentStock <= (item.minimumStock || 0);
      }).length,
      outOfStockItems: equipment.filter(item => item.currentStock === 0).length,
      totalStockValue: equipment.reduce((sum, item) => sum + (item.currentStock || 0), 0),
      mostUsedItems: equipment
        .sort((a, b) => (b.totalUsed || 0) - (a.totalUsed || 0))
        .slice(0, 5)
        .map(item => ({
          name: item.name,
          totalUsed: item.totalUsed || 0,
          currentStock: item.currentStock || 0
        }))
    };
    
    res.json(analytics);
  } catch (err) {
    console.error('Error fetching equipment analytics:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/equipment
// @desc    Add new equipment
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, tests, description, currentStock, minimumStock, unit } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Equipment name is required' });
    }

    if (!tests || !Array.isArray(tests) || tests.length === 0) {
      return res.status(400).json({ message: 'At least one test is required' });
    }

    // Validate test IDs
    const validTestIds = tests.map(t => t.test).filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validTestIds.length !== tests.length) {
      return res.status(400).json({ message: 'All test IDs must be valid ObjectIds' });
    }

    console.log('Received tests:', tests);
    console.log('Valid test IDs:', validTestIds);

    // Verify these tests exist in the database and are active
    const existingTests = await Test.find({
      _id: { $in: validTestIds },
      isActive: true
    });

    console.log('Found existing tests:', existingTests.map(t => t._id));

    if (existingTests.length === 0) {
      return res.status(400).json({ message: 'No valid tests found. Please ensure selected tests exist and are active.' });
    }

    if (existingTests.length !== validTestIds.length) {
      return res.status(400).json({ 
        message: 'Some selected tests were not found or are inactive.',
        found: existingTests.map(t => t._id),
        notFound: validTestIds.filter(id => !existingTests.find(t => t._id.toString() === id.toString()))
      });
    }

    // Create new equipment with verified test codes and details
    const equipment = new Equipment({
      name: name.trim(),
      tests: existingTests.map(t => ({
        test: t._id,
        testName: t.name,
        testCode: t.code
      })),
      description: description ? description.trim() : '',
      currentStock: currentStock || 0,
      minimumStock: minimumStock || 5,
      unit: unit || 'kits',
      isActive: true,
      lastStockUpdate: new Date(),
      stockHistory: [] // Initialize stockHistory array
    });

    // Add initial stock to history if provided
    if (currentStock && currentStock > 0) {
      equipment.stockHistory.push({
        quantity: currentStock,
        dateAdded: new Date(),
        notes: 'Initial stock'
      });
    }

    let savedEquipment = await equipment.save();
    
    // Populate test details for response
    savedEquipment = await Equipment.findById(savedEquipment._id)
      .populate({
        path: 'tests.test',
        select: 'name code price'
      })
      .lean();
      
    console.log('Saved equipment:', savedEquipment);
    res.status(201).json(savedEquipment);
  } catch (err) {
    console.error('Error creating equipment:', err);
    res.status(400).json({ message: err.message || 'Failed to create equipment' });
  }
});

// @route   PUT api/equipment/:id/add-stock
// @desc    Add stock to equipment
// @access  Private
router.put('/:id/add-stock', auth, async (req, res) => {
  try {
    console.log('Add stock request body:', req.body);
    const { quantity, notes } = req.body;
    
    // Parse and validate quantity
    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      console.log('Invalid quantity:', quantity);
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    console.log('Looking for equipment with ID:', req.params.id);
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      console.log('Equipment not found');
      return res.status(404).json({ message: 'Equipment not found' });
    }

    if (!equipment.isActive) {
      console.log('Equipment is inactive');
      return res.status(400).json({ message: 'Cannot add stock to inactive equipment' });
    }

    console.log('Adding stock:', parsedQuantity, 'notes:', notes);
    // Add stock directly
    equipment.currentStock = (equipment.currentStock || 0) + parsedQuantity;
    
    // Initialize stockHistory if it doesn't exist
    if (!equipment.stockHistory) {
      equipment.stockHistory = [];
    }
    
    equipment.stockHistory.push({
      quantity: parsedQuantity,
      dateAdded: new Date(),
      notes: notes || ''
    });
    equipment.lastStockUpdate = new Date();
    
    await equipment.save();
    
    // Populate the response with test codes
    const updatedEquipment = await Equipment.findById(equipment._id)
      .populate({
        path: 'tests.test',
        select: 'name code price'
      });
    res.json(updatedEquipment);
  } catch (err) {
    console.error('Error adding stock:', err);
    res.status(400).json({ message: err.message || 'Failed to add stock' });
  }
});

// @route   POST api/equipment/use-stock
// @desc    Use stock from equipment
// @access  Private
router.post('/use-stock', auth, async (req, res) => {
  try {
    const { equipmentId, quantity = 1 } = req.body;
    
    if (!equipmentId) {
      return res.status(400).json({ message: 'Equipment ID is required' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be positive' });
    }

    const equipment = await Equipment.findById(equipmentId);
    
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    if (!equipment.isActive) {
      return res.status(400).json({ message: 'Cannot use stock from inactive equipment' });
    }

    // Use useStock method if available, otherwise update manually
    if (typeof equipment.useStock === 'function') {
      await equipment.useStock(quantity);
    } else {
      // Manual stock usage
      if (equipment.currentStock < quantity) {
        return res.status(400).json({ message: 'Insufficient stock available' });
      }
      equipment.currentStock -= quantity;
      equipment.totalUsed = (equipment.totalUsed || 0) + quantity;
    }
    
    equipment.lastStockUpdate = new Date();
    const updatedEquipment = await equipment.save();
    res.json(updatedEquipment);
  } catch (err) {
    console.error('Error using stock:', err);
    res.status(400).json({ message: err.message || 'Failed to use stock' });
  }
});

// @route   POST api/equipment/:id/use
// @desc    Use stock from equipment by ID
// @access  Private
router.post('/:id/use', auth, async (req, res) => {
  try {
    const { quantity = 1 } = req.body;
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    if (!equipment.isActive) {
      return res.status(400).json({ message: 'Cannot use stock from inactive equipment' });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    if (equipment.currentStock < parsedQuantity) {
      return res.status(400).json({ 
        message: `Insufficient stock. Available: ${equipment.currentStock}, Requested: ${parsedQuantity}`
      });
    }

    if (typeof equipment.useStock === 'function') {
      await equipment.useStock(parsedQuantity);
    } else {
      equipment.currentStock -= parsedQuantity;
      equipment.totalUsed = (equipment.totalUsed || 0) + parsedQuantity;
      equipment.lastStockUpdate = new Date();
      equipment.lastUsed = new Date();
      
      equipment.stockHistory = equipment.stockHistory || [];
      equipment.stockHistory.push({
        quantity: -parsedQuantity,
        dateAdded: new Date(),
        notes: 'Stock used'
      });
      await equipment.save();
    }

    const updatedEquipment = await Equipment.findById(req.params.id)
      .populate({
        path: 'tests.test',
        select: 'name code price'
      });

    res.json(updatedEquipment);
  } catch (err) {
    console.error('Error using stock:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// @route   PUT api/equipment/:id
// @desc    Update equipment
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, tests, description, unit, currentStock, minimumStock } = req.body;
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    if (!equipment.isActive) {
      return res.status(400).json({ message: 'Cannot update inactive equipment' });
    }

    // Validate required fields if provided
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ message: 'Equipment name cannot be empty' });
    }

    if (tests !== undefined) {
      if (!Array.isArray(tests) || tests.length === 0) {
        return res.status(400).json({ message: 'At least one test is required' });
      }

      // Validate test IDs
      const validTestIds = tests.map(t => t.test).filter(id => mongoose.Types.ObjectId.isValid(id));
      if (validTestIds.length !== tests.length) {
        return res.status(400).json({ message: 'All test IDs must be valid ObjectIds' });
      }

      // Get test details from database
      const existingTests = await Test.find({ 
        _id: { $in: validTestIds },
        isActive: true 
      });
      
      if (existingTests.length !== validTestIds.length) {
        return res.status(400).json({ message: 'Some selected tests were not found or are inactive' });
      }

      // Update tests array with verified data
      equipment.tests = existingTests.map(test => ({
        test: test._id,
        testName: test.name,
        testCode: test.code
      }));
    }

    // Update other fields if provided
    if (name !== undefined) equipment.name = name.trim();
    if (description !== undefined) equipment.description = description ? description.trim() : '';
    if (unit !== undefined) equipment.unit = unit;
    if (typeof currentStock === 'number' && currentStock >= 0) equipment.currentStock = currentStock;
    if (typeof minimumStock === 'number' && minimumStock >= 0) equipment.minimumStock = minimumStock;

    const updatedEquipment = await equipment.save();
    
    // Populate test details for response
    const populatedEquipment = await Equipment.findById(updatedEquipment._id)
      .populate({
        path: 'tests.test',
        select: 'name code price'
      })
      .lean();

    res.json(populatedEquipment);
  } catch (err) {
    console.error('Error updating equipment:', err);
    res.status(400).json({ message: err.message || 'Failed to update equipment' });
  }
      });

// @route   GET api/equipment/:id/stock-dates
// @desc    Get stock history dates
// @access  Private
router.get('/:id/stock-dates', auth, async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    const stockDates = (equipment.stockHistory || []).map(entry => ({
      date: entry.dateAdded,
      quantity: entry.quantity,
      notes: entry.notes || ''
    }));

    res.json(stockDates);
  } catch (err) {
    console.error('Error fetching stock history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/equipment/:id
// @desc    Get equipment by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id)
      .populate({
        path: 'tests.test',
        select: 'name code price'
      }); // Populate test details
    
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    res.json(equipment);
  } catch (err) {
    console.error('Error fetching equipment by ID:', err);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid equipment ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/equipment/:id
// @desc    Delete equipment
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    
    await Equipment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Equipment deleted successfully' });
  } catch (err) {
    console.error('Error deleting equipment:', err);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid equipment ID' });
    }
    res.status(500).json({ message: 'Server error while deleting equipment' });
  }
});

module.exports = router;