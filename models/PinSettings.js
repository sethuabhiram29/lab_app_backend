const mongoose = require('mongoose');

const PinSettingsSchema = new mongoose.Schema({
    pin: {
        type: String,
        required: true,
        default: '0000'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PinSettings', PinSettingsSchema);
