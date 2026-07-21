const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PinSettings = require('../models/PinSettings');

// Helper function to ensure PIN settings exist
const ensurePinSettings = async () => {
    try {
        let pinSettings = await PinSettings.findOne();
        console.log('Existing PIN settings:', pinSettings);
        
        if (!pinSettings) {
            console.log('No PIN settings found, creating default');
            pinSettings = new PinSettings({ pin: '0000' });
            await pinSettings.save();
            console.log('Created default PIN settings:', pinSettings);
        }
        return pinSettings;
    } catch (err) {
        console.error('Error ensuring PIN settings:', err);
        throw err;
    }
};

// @route   GET api/pin-settings
// @desc    Get current PIN settings
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        await ensurePinSettings();
        res.json({ hasPin: true });
    } catch (err) {
        console.error('Error fetching PIN settings:', err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/pin-settings/validate
// @desc    Validate PIN
// @access  Private
router.post('/validate', auth, async (req, res) => {
    try {
        console.log('Received validation request:', req.body);
        const { pin } = req.body;

        if (!pin) {
            console.log('No PIN provided in request');
            return res.status(400).json({ success: false, message: 'PIN is required' });
        }

        // Ensure PIN is a string and exactly 4 digits
        const formattedPin = String(pin).padStart(4, '0');
        console.log('Formatted PIN for validation:', formattedPin);

        const pinSettings = await ensurePinSettings();
        console.log('Validating PIN:', formattedPin, 'against stored PIN:', pinSettings.pin);
        
        if (formattedPin === pinSettings.pin) {
            return res.json({ success: true });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid PIN' });
        }
    } catch (err) {
        console.error('Error validating PIN:', err);
        res.status(500).json({ 
            message: 'Server Error',
            error: err.message
        });
    }
});

// @route   PUT api/pin-settings/change-pin
// @desc    Change PIN
// @access  Private
router.put('/change-pin', auth, async (req, res) => {
    try {
        const { currentPin, newPin } = req.body;
        console.log('Attempting to change PIN. Current:', currentPin, 'New:', newPin);

        if (!currentPin || !newPin) {
            console.log('Missing PIN data:', { currentPin, newPin });
            return res.status(400).json({ message: 'Both current and new PIN are required' });
        }

        // Validate PIN format
        if (!/^\d{4}$/.test(newPin)) {
            console.log('Invalid new PIN format:', newPin);
            return res.status(400).json({ message: 'New PIN must be exactly 4 digits' });
        }

        const pinSettings = await ensurePinSettings();
        console.log('Current PIN in settings:', pinSettings.pin);

        if (currentPin !== pinSettings.pin) {
            console.log('Current PIN mismatch. Provided:', currentPin, 'Stored:', pinSettings.pin);
            return res.status(401).json({ message: 'Current PIN is incorrect' });
        }

        pinSettings.pin = newPin;
        await pinSettings.save();
        console.log('PIN updated successfully to:', newPin);

        res.json({ message: 'PIN updated successfully' });
    } catch (err) {
        console.error('Error changing PIN:', err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
