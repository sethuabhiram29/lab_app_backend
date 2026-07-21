const mongoose = require('mongoose');

const StockEntrySchema = new mongoose.Schema({
  quantity: {
    type: Number,
    required: true
  },
  dateAdded: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
});

const TestDetailsSchema = new mongoose.Schema({
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  testName: {
    type: String,
    required: true,
    trim: true
  },
  testCode: {
    type: String,
    required: true,
    trim: true
  }
}, { 
  _id: false, // Disable automatic _id creation for subdocuments
  autoIndex: false // Disable automatic index creation for the entire subdocument
});

const EquipmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  tests: {
    type: [TestDetailsSchema],
    required: true,
    default: undefined
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  currentStock: {
    type: Number,
    default: 0,
    min: 0
  },
  minimumStock: {
    type: Number,
    default: 5,
    min: 0
  },
  unit: {
    type: String,
    default: 'kits',
    trim: true,
    enum: ['kits', 'pieces', 'boxes', 'units']
  },
  stockHistory: [StockEntrySchema],
  isActive: {
    type: Boolean,
    default: true
  },
  lastStockUpdate: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: null
  },
  totalUsed: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  autoIndex: false, // Disable automatic index creation
  strict: true // Enforce schema validation
});

// Method to add stock
EquipmentSchema.methods.addStock = async function(quantity, notes = '') {
  if (!quantity || quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  
  this.currentStock = (this.currentStock || 0) + quantity;
  this.stockHistory = this.stockHistory || [];
  this.stockHistory.push({
    quantity: quantity,
    dateAdded: new Date(),
    notes: notes || ''
  });
  this.lastStockUpdate = new Date();
  await this.save();
  return this;
};

// Method to use stock
EquipmentSchema.methods.useStock = async function(quantity = 1) {
  if (!this.isActive) {
    throw new Error('Cannot use stock from inactive equipment');
  }

  if (quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  
  if (this.currentStock < quantity) {
    throw new Error(`Insufficient stock. Available: ${this.currentStock}, Requested: ${quantity}`);
  }
  
  this.currentStock -= quantity;
  this.totalUsed = (this.totalUsed || 0) + quantity;
  
  // Add negative entry to stock history for tracking
  this.stockHistory.push({
    quantity: -quantity,
    dateAdded: new Date(),
    notes: 'Stock used'
  });

  this.lastStockUpdate = new Date();
  this.lastUsed = new Date();
  return this.save();
};

// Method to check if stock is low
EquipmentSchema.methods.isLowStock = function() {
  return this.currentStock <= this.minimumStock;
};

// Method to get current stock status
EquipmentSchema.methods.getStockStatus = function() {
  if (this.currentStock === 0) {
    return { status: 'Out of Stock', severity: 'error' };
  } else if (this.currentStock <= this.minimumStock) {
    return { status: 'Low Stock', severity: 'warning' };
  }
  return { status: 'In Stock', severity: 'success' };
};

// Function to clean up old data and indexes
async function cleanupCollection(collection) {
  try {
    // List all indexes
    const indexes = await collection.listIndexes().toArray();
    console.log('Current indexes:', indexes);

    // Drop problematic indexes
    const problematicIndexes = [
      'testId_1',
      'tests.test_1',
      'tests.testId_1',
      'testId',
      'tests.test',
      'tests.testId'
    ];

    for (const indexName of problematicIndexes) {
      try {
        await collection.dropIndex(indexName);
        console.log(`Dropped index ${indexName}`);
      } catch (err) {
        // Ignore errors about non-existent indexes
        if (!err.message.includes('index not found')) {
          console.log(`Error dropping index ${indexName}:`, err.message);
        }
      }
    }

    // Clean up any documents with null test IDs
    await collection.updateMany(
      { 'tests.test': null },
      { $pull: { tests: { test: null } } }
    );

    console.log('Cleanup completed successfully');
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

// Set up cleanup on connection
mongoose.connection.once('open', async () => {
  const Equipment = mongoose.model('Equipment', EquipmentSchema);
  await cleanupCollection(Equipment.collection);
});

const Equipment = mongoose.model('Equipment', EquipmentSchema);

// Add a pre-save middleware to ensure no null test IDs
EquipmentSchema.pre('save', function(next) {
  if (this.tests) {
    this.tests = this.tests.filter(test => test.test != null);
  }
  next();
});

module.exports = Equipment;
