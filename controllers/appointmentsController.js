const Appointment = require("../models/Appointment.js");

// 🔹 Obtener citas por clínica
const getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ clinicId: req.user.clinicId })
      .populate("patientId")
      .populate("dentistId");
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Crear cita
const createAppointment = async (req, res) => {
  try {
    const { patientId, dentistId, date, description } = req.body;
    const appointment = await Appointment.create({
      patientId,
      dentistId,
      date,
      description,
      clinicId: req.user.clinicId,
    });
    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Actualizar cita
const updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user.clinicId },
      req.body,
      { new: true }
    );
    if (!appointment)
      return res.status(404).json({ error: "Cita no encontrada" });
    res.status(200).json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Eliminar cita
const deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndDelete({
      _id: req.params.id,
      clinicId: req.user.clinicId,
    });
    if (!appointment)
      return res.status(404).json({ error: "Cita no encontrada" });
    res.status(200).json({ message: "Cita eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment
}