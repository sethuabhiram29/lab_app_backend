const mongoose = require('mongoose');
const PinSettings = require('../models/PinSettings');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/MongoDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    try {
        // Delete any existing PIN settings
        await PinSettings.deleteMany({});
        console.log('Cleared existing PIN settings');

        // Create new default PIN settings
        const pinSettings = new PinSettings({ pin: '0000' });
        await pinSettings.save();
        console.log('Created new PIN settings with PIN: 0000');

        // Verify the settings
        const saved = await PinSettings.findOne();
        console.log('Saved PIN settings:', saved);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        mongoose.connection.close();
        console.log('Done');
    }
});
