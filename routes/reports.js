const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Report = require('../models/Report');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');
const Test = require('../models/Test');
const Equipment = require('../models/Equipment');
const { calculateFormula } = require('../utils/formulaCalculator');
const { decreaseStockForTest } = require('../utils/equipmentUtils');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const googleDriveService = require('../services/googleDrive');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'reports');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// @route   GET api/reports
// @desc    Get all reports
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.printed === 'true') filter.printed = true;
    if (req.query.printed === 'false') filter.printed = false;
    const reports = await Report.find(filter)
      .populate({
        path: 'patient',
        select: 'name age gender mobileNumber email updationLinks regNo _id createdAt refDoctor refAgent'
      })
      .populate({
        path: 'patient',
        populate: {
          path: 'refDoctor',
          select: 'name specialization contact email'
        }
      })
      .populate('createdBy', 'name')
      .sort({ reportDate: -1 })
      .select('+driveFileId +driveViewLink +driveDownloadLink +uploadStatus'); // Explicitly select Drive fields
    console.log('Retrieved reports with Drive info:', reports.map(r => ({
      id: r._id,
      driveInfo: {
        fileId: r.driveFileId,
        viewLink: r.driveViewLink,
        downloadLink: r.driveDownloadLink,
        status: r.uploadStatus
      }
    })));
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET api/reports/history
// @desc    Get report history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.printed === 'true') filter.printed = true;
    if (req.query.printed === 'false') filter.printed = false;
    const reports = await Report.find(filter)
      .populate('patient', 'name mobileNumber')
      .populate('createdBy', 'name')
      .sort({ reportDate: -1 });
    res.json(reports);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/reports/:id
// @desc    Get report by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('patient', 'name age gender mobileNumber')
      .populate('createdBy', 'name');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET api/reports/public/:id
// @desc    Get report by ID (public access)
// @access  Public
router.get('/public/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('patient', 'name age gender mobileNumber')
      .populate('createdBy', 'name');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    // Only return reports that are marked as printed/completed
    if (!report.printed) {
      return res.status(403).json({ message: 'Report not ready for viewing' });
    }
    
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST api/reports
// @desc    Create a report
// @access  Private
router.post('/', auth, async (req, res) => {
  console.log('DEBUG req.user:', req.user);
  try {
    const { patientId, testResults, reportDisplayData } = req.body;

    // Validate required fields
    if (!patientId || !testResults || !Array.isArray(testResults)) {
      return res.status(400).json({ message: 'Patient ID and test results are required' });
    }

    // Get patient
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Clean and validate test results - filter out any subtests with missing name or result
    // instead of rejecting the whole report
    const cleanedTestResults = testResults.map(result => ({
      ...result,
      packs: (result.packs || []).map(pack => ({
        ...pack,
        subtests: (pack.subtests || []).filter(sub => {
          const valid = sub.subTest && sub.subTest.trim() !== '' &&
                        sub.result !== undefined && sub.result !== null;
          if (!valid) console.warn('Skipping invalid pack subtest:', sub);
          return valid;
        })
      })).filter(pack => pack.subtests.length > 0),
      direct: (result.direct || []).filter(sub => {
        const valid = sub.subTest && sub.subTest.trim() !== '' &&
                      sub.result !== undefined && sub.result !== null;
        if (!valid) console.warn('Skipping invalid direct subtest:', sub);
        return valid;
      })
    })).filter(result => result.packs.length > 0 || result.direct.length > 0);

    if (!cleanedTestResults.length) {
      return res.status(400).json({ message: 'No valid test results found after filtering' });
    }

    // Process formulas and create report
    // First, fetch all tests that are referenced in the results
    const testNames = new Set();
    cleanedTestResults.forEach(result => {
      result.direct.forEach(sub => testNames.add(sub.subTest));
      result.packs.forEach(pack =>
        pack.subtests.forEach(sub => testNames.add(sub.subTest))
      );
    });

    // Fetch all required tests in one query
    const tests = await Test.find({
      $or: [
        { 'subtests.name': { $in: Array.from(testNames) } },
        { 'packs.subtests.name': { $in: Array.from(testNames) } }
      ]
    });

    // Process test results with formulas
    const processedTestResults = cleanedTestResults.map(result => {
      // Log the test being processed
      console.log('Processing test:', {
        testId: result.test,
        packs: result.packs.length,
        direct: result.direct.length
      });

      return {
        ...result,
        packs: result.packs.map(pack => ({
          ...pack,
          subtests: pack.subtests.map(sub => {
            // Find the test and subtest configuration
            const test = tests.find(t => 
              t.subtests.some(s => s.name === sub.subTest) ||
              t.packs.some(p => p.subtests.some(s => s.name === sub.subTest))
            );
            
            // Log test lookup
            console.log('Looking up subtest in pack:', {
              subtestName: sub.subTest,
              packName: pack.packName,
              foundTest: test?.name,
              inputValue: sub.result
            });

            const subTestConfig = test?.subtests?.find(s => s.name === sub.subTest) ||
                                test?.packs?.flatMap(p => p.subtests)?.find(s => s.name === sub.subTest);
            
            // Log subtest config
            console.log('Found subtest config:', {
              subtestName: sub.subTest,
              hasFormula: !!subTestConfig?.formula,
              formula: subTestConfig?.formula
            });

            if (subTestConfig?.formula) {
              const calculatedResult = calculateFormula(subTestConfig.formula, sub.result);
              return {
                ...sub,
                result: calculatedResult
              };
            }
            return sub;
          })
        })),
        direct: result.direct.map(sub => {
          // Find the test and subtest configuration
          const test = tests.find(t => 
            t.subtests.some(s => s.name === sub.subTest) ||
            t.packs.some(p => p.subtests.some(s => s.name === sub.subTest))
          );

          // Log test lookup
          console.log('Looking up direct subtest:', {
            subtestName: sub.subTest,
            foundTest: test?.name,
            inputValue: sub.result
          });

          const subTestConfig = test?.subtests?.find(s => s.name === sub.subTest) ||
                              test?.packs?.flatMap(p => p.subtests)?.find(s => s.name === sub.subTest);

          // Log subtest config
          console.log('Found direct subtest config:', {
            subtestName: sub.subTest,
            hasFormula: !!subTestConfig?.formula,
            formula: subTestConfig?.formula
          });

          if (subTestConfig?.formula) {
            const calculatedResult = calculateFormula(subTestConfig.formula, sub.result);
            return {
              ...sub,
              result: calculatedResult
            };
          }
          return sub;
        })
      };
    });

    try {
      // Equipment stock validation removed - reports can be created regardless of stock

      // Create the report
      const report = new Report({
        patient: patientId,
        testResults: processedTestResults,
        createdBy: req.user._id,
        reportDate: new Date(),
        reportDisplayData: reportDisplayData || null
      });

      // Save the report first to ensure it's valid
      const savedReport = await report.save();

      // Equipment stock management removed - no longer tied to report creation
      return res.json(savedReport);

    } catch (error) {
      console.error('Error processing report:', error);
      // No need to rollback since equipment stock update is removed
      return res.status(500).json({
        message: 'Failed to process report. Please try again.'
      });
    }

    // Populate and return the saved report
    const populatedReport = await Report.findById(report._id)
      .populate('patient', 'name age gender mobileNumber')
      .populate('createdBy', 'name');

    res.status(201).json(populatedReport);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT api/reports/:id
// @desc    Update a report
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    console.log('Updating report with data:', req.body);
    let report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Extract Drive-related fields
    const { driveFileId, driveViewLink, driveDownloadLink, uploadStatus } = req.body;

    // Update report with all fields including Drive info
    const updateData = {
      ...req.body,
      // Only include Drive fields if they are provided
      ...(driveFileId && { driveFileId }),
      ...(driveViewLink && { driveViewLink }),
      ...(driveDownloadLink && { driveDownloadLink }),
      ...(uploadStatus && { uploadStatus })
    };
    
    console.log('Final update data:', updateData);
    
    report = await Report.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).populate('patient', 'name age gender mobileNumber email')
      .populate({
        path: 'patient',
        populate: {
          path: 'refDoctor',
          select: 'name specialization contact email'
        }
      });

    res.json(report);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.status(500).send('Server Error');
  }
});

// PATCH endpoint to mark a report as printed
router.patch('/:id/printed', auth, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { $set: { printed: true } },
      { new: true }
    );
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    // Mark patient as completed after printing
    const patient = await Patient.findById(report.patient);
    if (patient) {
      patient.reportStatus = 'completed';
      await patient.save();
    }
    res.json(report);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/send-email
// @desc    Send email with report link
// @access  Private
router.post('/send-email', auth, async (req, res) => {
  try {
    const { to, subject, body, reportId } = req.body;

    // Validate required fields
    if (!to || !subject || !body || !reportId) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Get report to verify it exists and is ready
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (!report.printed) {
      return res.status(400).json({ message: 'Report is not ready for sharing' });
    }

    // For now, just log the email details (for testing)
    console.log('Email would be sent:');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Body:', body);
    console.log('Report ID:', reportId);

    // TODO: Configure email service
    // For production, uncomment and configure the email service below:
    /*
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>')
    };

    await transporter.sendMail(mailOptions);
    */

    res.json({ message: 'Email details logged successfully. Configure email service for actual sending.' });
  } catch (error) {
    console.error('Error processing email:', error);
    res.status(500).json({ message: 'Failed to process email request' });
  }
});

// @route   POST api/reports/upload-pdf
// @desc    Upload PDF file and return download URL
// @access  Private
router.post('/upload-pdf', auth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: `File error: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { reportId } = req.body;
    
    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required' });
    }
    
    // Validate report exists
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Generate download URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
    const downloadUrl = `${baseUrl}/api/reports/download-pdf/${req.file.filename}`;

    // Store file info in report
    report.pdfFile = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      uploadDate: new Date()
    };
    await report.save();

    console.log('PDF uploaded successfully:', {
      filename: req.file.filename,
      reportId: reportId,
      downloadUrl: downloadUrl
    });

    res.json({ 
      message: 'PDF uploaded successfully',
      downloadUrl: downloadUrl,
      filename: req.file.filename
    });

  } catch (error) {
    console.error('Error uploading PDF:', error);
    res.status(500).json({ message: `Failed to upload PDF: ${error.message}` });
  }
});

// @route   POST api/reports/upload-to-drive
// @desc    Upload PDF to Google Drive and return shareable link
// @access  Private
router.post('/upload-to-drive', auth, async (req, res) => {
  try {
    const { reportId, pdfBuffer, fileName } = req.body;

    if (!reportId || !pdfBuffer || !fileName) {
      return res.status(400).json({ message: 'Report ID, PDF buffer, and filename are required' });
    }

    // Validate report exists
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Convert base64 buffer to actual buffer
    const buffer = Buffer.from(pdfBuffer, 'base64');

    // Upload to Google Drive
    const driveResult = await googleDriveService.uploadPDFFromBuffer(buffer, fileName);

    // Store Google Drive info in report
    report.googleDriveFile = {
      fileId: driveResult.fileId,
      webViewLink: driveResult.webViewLink,
      webContentLink: driveResult.webContentLink,
      uploadDate: new Date()
    };
    await report.save();

    console.log('PDF uploaded to Google Drive successfully:', {
      fileId: driveResult.fileId,
      reportId: reportId,
      webViewLink: driveResult.webViewLink
    });

    res.json({ 
      message: 'PDF uploaded to Google Drive successfully',
      webViewLink: driveResult.webViewLink,
      webContentLink: driveResult.webContentLink,
      fileId: driveResult.fileId
    });

  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ message: `Failed to upload to Google Drive: ${error.message}` });
  }
});

// @route   GET api/reports/download-pdf/:filename
// @desc    Download PDF file
// @access  Public
router.get('/download-pdf/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '..', 'uploads', 'reports', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({ message: 'Failed to download PDF' });
  }
});

// @route   POST api/reports/generate-public-pdf
// @desc    Generate PDF and save to local storage with public URL
// @access  Private
router.post('/generate-public-pdf', auth, async (req, res) => {
  try {
    const { reportId, pdfBuffer, fileName } = req.body;

    if (!reportId || !pdfBuffer || !fileName) {
      return res.status(400).json({ message: 'Report ID, PDF buffer, and filename are required' });
    }

    // Validate report exists
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Convert base64 buffer to actual buffer
    const buffer = Buffer.from(pdfBuffer, 'base64');

    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, '..', 'uploads', 'public');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFileName = `public-${safeFileName}-${uniqueSuffix}.pdf`;
    const filePath = path.join(uploadDir, finalFileName);

    // Save file to disk
    fs.writeFileSync(filePath, buffer);

    // Generate public URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
    const publicUrl = `${baseUrl}/api/reports/public-pdf/${finalFileName}`;

    // Store file info in report
    report.publicPdfFile = {
      filename: finalFileName,
      originalName: fileName,
      path: filePath,
      publicUrl: publicUrl,
      uploadDate: new Date()
    };
    await report.save();

    console.log('PDF saved with public access:', {
      filename: finalFileName,
      reportId: reportId,
      publicUrl: publicUrl
    });

    res.json({ 
      message: 'PDF saved with public access',
      publicUrl: publicUrl,
      filename: finalFileName
    });

  } catch (error) {
    console.error('Error saving PDF:', error);
    res.status(500).json({ message: `Failed to save PDF: ${error.message}` });
  }
});

// @route   GET api/reports/public-pdf/:filename
// @desc    Serve public PDF file
// @access  Public
router.get('/public-pdf/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '..', 'uploads', 'public', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Set headers for file viewing (not download)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error serving public PDF:', error);
    res.status(500).json({ message: 'Failed to serve PDF' });
  }
});

module.exports = router;