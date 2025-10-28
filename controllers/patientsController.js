const Patient = require("../models/Patient.js");

// 🔹 Obtener todos los pacientes de la clínica del usuario
const getPatients = async (req, res) => {
  try {
    const patients = await Patient.find({ clinicId: req.user.clinicId });
    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Obtener un paciente por ID
const getPatientById = async (req, res) => {
  try {
    const patient = await Patient.findOne({
      _id: req.params.id,
      clinicId: req.user.clinicId,
    });
    if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Crear paciente
const createPatient = async (req, res) => {
  try {
    const { name, email, phone, customFields } = req.body;
    const patient = await Patient.create({
      name,
      lastName,
      email,
      phone,
      age,
      birthday,
      clinicId: req.user.clinicId,
      createdBy: req.user.userId,
      customFields,
    });
    res.status(201).json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Actualizar paciente
const updatePatient = async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user.clinicId },
      req.body,
      { new: true }
    );
    if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Eliminar paciente
const deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findOneAndDelete({
      _id: req.params.id,
      clinicId: req.user.clinicId,
    });
    if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
    res.status(200).json({ message: "Paciente eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient
}