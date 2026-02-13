const User = require("../models/User");
const Clinic = require("../models/Clinic");
const { sendAccountActivationEmail, sendAccountRejectionEmail } = require("../utils/emailService");
const { getActivePlan } = require("../utils/planHelper");

// Obtener asistentes pendientes de aprobación para la clínica del doctor
const getPendingAssistants = async (req, res) => {
  try {
    // El middleware de autenticación debe haber puesto el usuario en req.user
    const doctorId = req.user._id;

    // Buscar al doctor para obtener su clinicId
    // Nota: Podríamos usar req.user.clinicId si lo guardamos en el token, 
    // pero consultamos para asegurar datos frescos.
    const doctor = await User.findById(doctorId);

    if (!doctor || doctor.role !== "doctor") {
      return res.status(403).json({ error: "Acceso denegado. Solo doctores pueden ver esta información." });
    }

    const pendingAssistants = await User.find({
      clinicId: doctor.clinicId,
      role: "assistant",
      status: "pending",
    }).select("-password");

    res.status(200).json(pendingAssistants);
  } catch (error) {
    console.error("Error obteniendo asistentes pendientes:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Aprobar un asistente
const approveAssistant = async (req, res) => {
  try {
    const { assistantId } = req.body; // O req.params.id si prefieres por URL
    const doctorId = req.user._id;

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    const assistant = await User.findById(assistantId);
    if (!assistant) {
      return res.status(404).json({ error: "Asistente no encontrado." });
    }

    // Verificar que pertenezca a la misma clínica
    if (assistant.clinicId.toString() !== doctor.clinicId.toString()) {
      return res.status(403).json({ error: "No puedes aprobar asistentes de otra clínica." });
    }

    if (assistant.status === "active") {
      return res.status(400).json({ error: "El asistente ya está activo." });
    }

    // VERIFICAR LÍMITES DEL PLAN
    const clinic = await Clinic.findById(doctor.clinicId);
    // Usar helper para determinar plan activo (considera cancelaciones con período de gracia)
    const currentPlan = getActivePlan(clinic);

    // Free: 0 assistants (según imagen 'Manage up to 5 patients' pero NO menciona assistants. Pro dice 'Up to 2'. Plus 'Unlimited')
    // Asumimos Free = 0 asistentes.

    let limit = 0;
    if (currentPlan === 'clinic_pro') limit = 2;
    if (currentPlan === 'clinic_plus') limit = 9999;

    if (currentPlan === 'free') {
      return res.status(403).json({ error: "El plan gratuito no permite agregar asistentes. Actualiza a Pro o Plus." });
    }

    // Contar activos
    const currentAssistants = await User.countDocuments({
      clinicId: doctor.clinicId,
      role: "assistant",
      status: "active"
    });

    if (currentAssistants >= limit) {
      return res.status(403).json({ error: `Tu plan (${currentPlan}) solo permite ${limit} asistentes. Actualiza para añadir más.` });
    }

    // Actualizar estado
    assistant.status = "active";
    await assistant.save();

    // Enviar correo
    await sendAccountActivationEmail(assistant.email, assistant.name);

    res.status(200).json({ message: "Asistente aprobado y notificado correctamente.", assistant });
  } catch (error) {
    console.error("Error aprobando asistente:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Obtener todos los asistentes (activos) de la clínica del doctor
const getAllAssistants = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const doctor = await User.findById(doctorId);

    if (!doctor || doctor.role !== "doctor") {
      return res.status(403).json({ error: "Acceso denegado. Solo doctores pueden ver esta información." });
    }

    const assistants = await User.find({
      clinicId: doctor.clinicId,
      role: "assistant",
      status: "active",
    }).select("-password");

    res.status(200).json(assistants);
  } catch (error) {
    console.error("Error obteniendo asistentes:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Rechazar un asistente
const rejectAssistant = async (req, res) => {
  try {
    const { assistantId } = req.body;
    const doctorId = req.user._id;

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    const assistant = await User.findById(assistantId);
    if (!assistant) {
      return res.status(404).json({ error: "Asistente no encontrado." });
    }

    // Verificar que pertenezca a la misma clínica
    if (assistant.clinicId.toString() !== doctor.clinicId.toString()) {
      return res.status(403).json({ error: "No puedes rechazar asistentes de otra clínica." });
    }

    if (assistant.status !== "pending") {
      return res.status(400).json({ error: "Solo se pueden rechazar solicitudes pendientes." });
    }

    // Enviar correo de notificación antes de eliminar
    await sendAccountRejectionEmail(assistant.email, assistant.name);

    // Eliminar el usuario
    await User.findByIdAndDelete(assistantId);

    res.status(200).json({ message: "Solicitud rechazada y usuario eliminado." });
  } catch (error) {
    console.error("Error rechazando asistente:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

const getAssistantPermissions = async (req, res) => {
  try {
    // Solo doctor puede consultar
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { assistantId } = req.params;

    // Buscar asistente en la misma clínica
    const assistant = await User.findOne({
      _id: assistantId,
      role: 'assistant',
      clinicId: req.user.clinicId
    }).select('permissions name email');

    if (!assistant) {
      return res.status(404).json({ error: 'Asistente no encontrado' });
    }

    res.json({
      assistantId: assistant._id,
      name: assistant.name,
      email: assistant.email,
      permissions: assistant.permissions || {}
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateAssistantPermissions = async (req, res) => {
  try {
    // 1️⃣ Solo doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { assistantId } = req.params;
    const { permissions } = req.body;

    // 2️⃣ Buscar asistente
    const assistant = await User.findOne({
      _id: assistantId,
      role: 'assistant',
      clinicId: req.user.clinicId
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Asistente no encontrado' });
    }

    // 3️⃣ Lista blanca de permisos válidos
    const allowedPermissions = [
      'createPatient',
      'editPatient',
      'deletePatient',
      'createAppointment',
      'editAppointment',
      'deleteAppointment',
      'manageFiles',
      'manageInventory'
    ];

    // 4️⃣ Actualizar solo permisos permitidos
    allowedPermissions.forEach(key => {
      if (permissions.hasOwnProperty(key)) {
        assistant.permissions[key] = permissions[key];
      }
    });

    await assistant.save();

    res.json({
      message: 'Permisos actualizados correctamente',
      permissions: assistant.permissions
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


module.exports = {
  getPendingAssistants,
  approveAssistant,
  getAllAssistants,
  rejectAssistant,
  getAssistantPermissions,
  updateAssistantPermissions,
};