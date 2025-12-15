const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["doctor", "assistant", "patient"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "pending"],
      default: "active",
    },
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
    },
    permissions: {
      createPatient: { type: Boolean, default: false },
      editPatient: { type: Boolean, default: false },
      deletePatient: { type: Boolean, default: false },
      createAppointment: { type: Boolean, default: false },
      editAppointment: { type: Boolean, default: false },
      deleteAppointment: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
