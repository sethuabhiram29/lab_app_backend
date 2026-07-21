const mongoose = require('mongoose');
const PinSettings = require('../models/PinSettings');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/MongoDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    try {
        // Find all PIN settings
        const pinSettings = await PinSettings.find();
        console.log('All PIN settings:', pinSettings);

        // Clear existing settings
        await PinSettings.deleteMany({});
        console.log('Cleared all PIN settings');

        // Create new default settings
        const newPinSettings = new PinSettings({ pin: '0000' });
        await newPinSettings.save();
        console.log('Created new PIN settings:', newPinSettings);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        mongoose.connection.close();
    }
});
