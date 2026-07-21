const mongoose = require('mongoose');
const PinSettings = require('../models/PinSettings');

const initPinSettings = async () => {
    try {
        // Check if PIN settings exist
        let pinSettings = await PinSettings.findOne();
        
        if (!pinSettings) {
            // Create default PIN settings
            pinSettings = new PinSettings({
                pin: '0000'
            });
            await pinSettings.save();
            console.log('Created default PIN settings with PIN: 0000');
        } else {
            console.log('PIN settings already exist');
        }
    } catch (err) {
        console.error('Error initializing PIN settings:', err);
    }
};

mongoose.connection.once('open', () => {
    console.log('MongoDB connected, initializing PIN settings...');
    initPinSettings();
});
