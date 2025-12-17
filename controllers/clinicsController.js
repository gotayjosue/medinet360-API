const Clinic = require("../models/Clinic.js");

const getClinicById = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found" });
    }
    res.status(200).json(clinic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getClinicById
}