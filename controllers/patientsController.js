const Patient = require("../models/Patient.js");
const Clinic = require("../models/Clinic.js");

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

//Calcular la edad
const calculateAge = (birthday) => {
  const today = new Date();
  const birth = new Date(birthday);                // birthday es ISO (YYYY-MM-DD)

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;        // todavía no ha cumplido su cumpleaños este año
  }
  return age;
};

// 🔹 Crear paciente
const createPatient = async (req, res) => {
  try {
    const { name, lastName, birthday, email, phone, gender, notes, customFields } = req.body;

    // Verificar Plan
    const clinic = await Clinic.findById(req.user.clinicId);

    // Si no tiene plan o es 'free' y ya tiene 5 pacientes
    // Consideramos "activo" si status es 'active' o 'trialing' Y la fecha no ha expirado (si es exigente)
    // Para simplificar, confiamos en 'plan'. 
    // Plan 'free' = limite 5.

    const isPlanActive = clinic.subscriptionStatus === 'active' || clinic.subscriptionStatus === 'trialing';
    // Nota: Aunque el plan sea 'clinic_pro', si el status es 'past_due' o 'canceled' (y expiró), 
    // deberíamos degradar lógica. Pero por ahora chequeamos el nombre del plan guardado.

    const currentPlan = (isPlanActive) ? clinic.plan : 'free';

    if (currentPlan === 'free') {
      const count = await Patient.countDocuments({ clinicId: req.user.clinicId });
      if (count >= 5) {
        return res.status(403).json({ error: "Has alcanzado el límite de 5 pacientes del plan gratuito. Actualiza tu plan para añadir más." });
      }
    }

    //Calculating age before creating patient object
    const age = calculateAge(birthday)

    const patient = await Patient.create({
      name,
      lastName,
      email,
      phone,
      age,
      gender,
      birthday,
      notes,
      clinicId: req.user.clinicId,
      createdBy: req.user._id,
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