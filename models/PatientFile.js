const mongoose = require("mongoose");

const patientFileSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },
        clinicId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Clinic",
            required: true,
            index: true,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        fileName: {
            type: String,
            required: true,
        },
        fileType: {
            type: String,
            required: true, // MIME type: image/jpeg, application/pdf, etc.
        },
        fileCategory: {
            type: String,
            enum: ["lab_results", "imaging", "prescriptions", "documents", "other"],
            default: "other",
        },
        cloudinaryPublicId: {
            type: String,
            required: true,
            unique: true,
        },
        cloudinaryUrl: {
            type: String,
            required: true,
        },
        cloudinaryResourceType: {
            type: String,
            enum: ["image", "video", "raw"],
            required: true,
        },
        fileSizeBytes: {
            type: Number,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// Índice compuesto para consultas eficientes
patientFileSchema.index({ clinicId: 1, patientId: 1 });

const PatientFile = mongoose.model("PatientFile", patientFileSchema);
module.exports = PatientFile;
