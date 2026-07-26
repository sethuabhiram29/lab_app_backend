const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true
    },
    testResults: [{
        test: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Test',
            required: true
        },
        packs: [{
            packName: String,
            subtests: [{
                subTest: {
                    type: String,
                    required: true
                },
                name: String,
                result: String,
                unit: String,
                range: String
            }]
        }],
        direct: [{
            subTest: {
                type: String,
                required: true
            },
            name: String,
            result: String,
            unit: String,
            range: String
        }]
    }],
    equipmentUsed: [{
        equipment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Equipment',
            required: true
        },
        equipmentName: String,
        test: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Test',
            required: true
        },
        testName: String,
        testCode: String,
        usedAt: {
            type: Date,
            default: Date.now
        }
    }],
    reportDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'printed'],
        default: 'pending'
    },
    driveFileId: {
        type: String,
        sparse: true
    },
    driveViewLink: {
        type: String,
        sparse: true
    },
    driveDownloadLink: {
        type: String,
        sparse: true
    },
    uploadStatus: {
        type: String,
        enum: ['pending', 'uploaded', 'needs_update', 'not_uploaded'],
        default: 'not_uploaded'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    reportDisplayData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    printed: {
        type: Boolean,
        default: false
    },
    pdfFile: {
        filename: String,
        originalName: String,
        path: String,
        uploadDate: Date
    },
    googleDriveFile: {
        fileId: String,
        webViewLink: String,
        webContentLink: String,
        uploadDate: Date
    }
});

module.exports = mongoose.model('Report', ReportSchema); 