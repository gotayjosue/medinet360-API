const mongoose = require("mongoose");

const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Clinic = mongoose.model("Clinic", clinicSchema);
module.exports = Clinic;
