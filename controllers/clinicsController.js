const Clinic = require("../models/Clinic.js");
const { getActivePlan } = require("../utils/planHelper.js");

const getClinicById = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    // AUTO-UPDATE: Si el plan guardado es distinto al que dicta el helper (ej: expiró)
    const activePlan = getActivePlan(clinic);
    if (activePlan === 'free' && clinic.plan !== 'free') {
      clinic.plan = 'free';
      await clinic.save();
      console.log(`🧹 Auto-update: Plan de clínica "${clinic.name}" (${clinic._id}) corregido a free por expiración.`);
    }

    res.status(200).json(clinic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateCustomFieldsTemplate = async (req, res) => {
  const { id } = req.params;
  const { customFieldTemplate } = req.body;

  try {
    const clinic = await Clinic.findByIdAndUpdate(
      id,
      { customFieldTemplate },
      { new: true, runValidators: true }
    );

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    res.status(200).json(clinic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateClinic = async (req, res) => {
  const { id } = req.params;
  const { name, address, phone } = req.body;

  try {
    const clinic = await Clinic.findByIdAndUpdate(
      id,
      { name, address, phone },
      { new: true, runValidators: true }
    );

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    res.status(200).json(clinic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getClinicById,
  updateCustomFieldsTemplate,
  updateClinic
}