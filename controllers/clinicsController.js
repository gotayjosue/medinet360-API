const Clinic = require("../models/Clinic.js");

const getClinicById = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);
    res.status(200).json(clinic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getClinicById
}