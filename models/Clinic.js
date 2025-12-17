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
    customFieldTemplate: [
      {
        label: { type: String, required: true },
        type: { type: String, required: true },
        options: [{ type: String }],
      }
    ],
  },
  { timestamps: true }
);

const Clinic = mongoose.model("Clinic", clinicSchema);
module.exports = Clinic;
