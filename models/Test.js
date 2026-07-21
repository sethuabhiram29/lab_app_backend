const mongoose = require('mongoose');

const SubTestSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    maleReference: { type: String, trim: true, default: '' },
    femaleReference: { type: String, trim: true, default: '' },
    hasGenderSpecificRanges: { type: Boolean, default: false },
    result: { type: String, trim: true, default: '' },
    formula: { type: String, trim: true, default: '' },
    image: { type: String, default: '' }
});

const PackSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    requiresSeparatePage: { type: Boolean, default: false },
    subtests: [SubTestSchema]
});

const TestSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String, trim: true },
    image: { type: String, default: '' },
    subtests: [SubTestSchema],
    packs: [PackSchema],
    isActive: { type: Boolean, default: true },
    requiresSeparatePage: { type: Boolean, default: false }
}, {
    timestamps: true
});

// Add compound index for code and isActive
TestSchema.index({ code: 1, isActive: 1 });

// Remove the collection drop code as it's causing issues
// mongoose.connection.once('open', async () => {
//     try {
//         await mongoose.connection.collection('tests').drop();
//         console.log('Tests collection dropped successfully');
//     } catch (err) {
//         console.log('Tests collection does not exist or could not be dropped:', err.message);
//     }
// });

module.exports = mongoose.model('Test', TestSchema); 