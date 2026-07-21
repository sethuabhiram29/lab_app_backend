const Equipment = require('../models/Equipment');
const mongoose = require('mongoose');

const decreaseStockForTest = async (testId) => {
    try {
        if (!testId) {
            console.error('No test ID provided to decreaseStockForTest');
            return false;
        }

        // Convert string ID to ObjectId if needed
        try {
            testId = typeof testId === 'string' ? new mongoose.Types.ObjectId(testId) : testId;
        } catch (err) {
            console.error('Invalid test ID format:', testId);
            return false;
        }

        // Use findOneAndUpdate to atomically update the stock
        const result = await Equipment.findOneAndUpdate(
            {
                'tests.test': testId,
                isActive: true,
                currentStock: { $gt: 0 }
            },
            {
                $inc: { 
                    currentStock: -1,
                    totalUsed: 1
                },
                $set: { 
                    lastStockUpdate: new Date(),
                    lastUsed: new Date()
                },
                $push: {
                    stockHistory: {
                        quantity: -1,
                        dateAdded: new Date(),
                        notes: 'Used for patient test'
                    }
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!result) {
            console.warn(`No equipment found with available stock for test ${testId}`);
            return false;
        }

        // Log warning if stock is low
        if (result.currentStock <= result.minimumStock) {
            console.warn(`Equipment ${result.name} is now at low stock (${result.currentStock}/${result.minimumStock})`);
        }

        console.log(`Successfully decreased stock for equipment ${result.name} to ${result.currentStock}`);
        return true;

    } catch (error) {
        console.error('Error decreasing stock for test:', error);
        return false;
    }
};

module.exports = {
    decreaseStockForTest
};


