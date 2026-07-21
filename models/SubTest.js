const mongoose = require('mongoose');

const SubTestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        default: ''
    },
    range: {
        type: String,
        default: ''
    },
    result: {
        type: String,
        default: ''
    },
    normalRange: {
        min: Number,
        max: Number
    },
    price: {
        type: Number,
        required: true
    },
    packName: {
        type: String,
        default: ''
    },
    test: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Test',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SubTest', SubTestSchema); 