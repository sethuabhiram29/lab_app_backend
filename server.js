const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();

// Increase body size limit to 10mb for JSON and URL-encoded payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Middleware
app.use(cors());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// MongoDB Connection with retry logic
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/MongoDB';
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Please install MongoDB or set MONGODB_URI environment variable');
    setTimeout(connectDB, 10000);
  }
};

// Connect to MongoDB
connectDB();

// Initialize PIN settings
require('./scripts/init-pin-settings');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/pin-settings', require('./routes/pinSettings'));
app.use('/api/commissions', require('./routes/commissions'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/subtests', require('./routes/subtests'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/equipment', require('./routes/equipment'));
app.use('/api/updation-links', require('./routes/updationLinks'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});


// ✅ Serve React build (frontend) dynamically if it exists
const buildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(buildPath)) {
  console.log(`Serving static frontend build from: ${buildPath}`);
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.log('Static frontend build folder not found. Running as API-only server.');
  app.get('*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found' });
  });
}


// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/MongoDB'}`);
});
