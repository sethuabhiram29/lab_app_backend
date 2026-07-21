const PinSettings = require('../models/PinSettings');

module.exports = async function(req, res, next) {
    try {
        // Get PIN from request header
        const pin = req.header('x-pin');

        if (!pin) {
            return res.status(401).json({ message: 'PIN is required' });
        }

        const pinSettings = await PinSettings.findOne();
        
        if (!pinSettings) {
            return res.status(404).json({ message: 'PIN settings not found' });
        }

        if (pin !== pinSettings.pin) {
            return res.status(401).json({ message: 'Invalid PIN' });
        }

        next();
    } catch (err) {
        console.error('Error in PIN check middleware:', err);
        res.status(500).send('Server Error');
    }
};
