const mongoose = require("mongoose");

const trialFingerprintSchema = new mongoose.Schema({
  cardFingerprint: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  firstUsedAt: {
    type: Date,
    default: Date.now
  },
  clinicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Clinic",
    required: true
  },
  subscriptionId: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model("TrialFingerprint", trialFingerprintSchema);
