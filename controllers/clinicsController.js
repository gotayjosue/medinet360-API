const Clinic = require("../models/Clinic.js");

const getClinics = async (req, res) => {
  try {
    const clinics = await Clinic.find().select("name _id");
    res.status(200).json(clinics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getClinics
}