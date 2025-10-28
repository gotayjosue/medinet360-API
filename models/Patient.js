const mongoose = require("mongoose");
const { type } = require("os");

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    lastName: {type: String, required: true},
    email: { type: String, required: true },
    phone: { type: String, required: true},
    age: { type: Number, required: true},
    birthday: {type: Date, required: true },
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    customFields: {
      type: Object, // Guarda los campos personalizados (JSON flexible)
      default: {},
    },
  },
  { timestamps: true }
);

const Patient = mongoose.model("Patient", patientSchema);
module.exports = Patient;
