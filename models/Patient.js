const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        required: true
    },
    gender: {
        type: String,
        required: true,
        enum: ['Male', 'Female', 'Other']
    },
    mobileNumber: {
        type: String,
        required: false,
        default: ''
    },
    email: {
        type: String,
        default: ''
    },
    sampleCollectionDate: {
        type: Date,
        default: Date.now
    },
    refDoctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor'
    },
    refAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },
    totalAmount: {
        type: Number,
        required: true
    },
    advancePaid: {
        type: Number,
        default: 0
    },
    commission: {
        type: Number,
        default: 0
    },
    dueAmount: {
        type: Number,
        default: 0
    },
    selectedTests: [{
        test: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Test',
            required: true
        },
        parameters: [
            {
                name: String,
                unit: String,
                range: String,
                _id: false
            }
        ],
        subtests: [
            {
                name: String,
                unit: String,
                reference: String,
                _id: false
            }
        ],
        packs: [
            {
                name: String,
                subtests: [
                    {
                        name: String,
                        unit: String,
                        reference: String,
                        _id: false
                    }
                ]
            }
        ]
    }],
    reportStatus: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    regNo: {
        type: Number,
        required: true,
        unique: true
    },
    updationLinks: {
        viewLink: { type: String },
        downloadLink: { type: String },
        updatedAt: { type: Date },
        patientName: { type: String },
        patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }
    }
});

module.exports = mongoose.model('Patient', PatientSchema);