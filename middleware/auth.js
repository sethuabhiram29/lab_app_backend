const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token') || req.headers.authorization?.split(' ')[1];
  
  console.log('Auth middleware - Headers:', req.headers); // Debug log
  console.log('Auth middleware - Token:', token); // Debug log

  // Check if not token
  if (!token) {
    console.log('Auth middleware - No token found'); // Debug log
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('Auth middleware - Decoded token:', decoded); // Debug log
    
    // Set user in request
    req.user = {
      _id: decoded._id || decoded.id,
      role: decoded.role
    };
    
    next();
  } catch (err) {
    console.error('Auth middleware - Token verification error:', err); // Debug log
    res.status(401).json({ message: 'Token is not valid' });
  }
}; 