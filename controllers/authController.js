const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");
const Clinic = require("../models/Clinic.js");

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// 🔹 REGISTRO
const register = async (req, res) => {
  try {
    const { name, email, password, role, clinicName, clinicId } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    let assignedClinicId = clinicId;

    // Si es doctor: crea nueva clínica
    if (role === "doctor") {
      const newClinic = await Clinic.create({
        name: clinicName,
        adminId: null, // lo llenamos después
      });
      assignedClinicId = newClinic._id;
    }

    // Si es ASISTENTE → debe seleccionar una clínica existente
    if (role === "assistant") {
      if (!clinicId)
        return res.status(400).json({ error: "Debes seleccionar una clínica existente" });

      const clinicExists = await Clinic.findById(clinicId);
      if (!clinicExists)
        return res.status(404).json({ error: "La clínica seleccionada no existe" });

      assignedClinicId = clinicId;
    }

    // Crear usuario
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      clinicId: assignedClinicId,
    });

    // Si el usuario es doctor, actualizar clínica con adminId
    if (role === "doctor") {
      await Clinic.findByIdAndUpdate(assignedClinicId, { adminId: user._id });
    }

    res.status(201).json({ message: "Usuario registrado correctamente", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { userId: user._id, role: user.role, clinicId: user.clinicId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({ message: "Login exitoso", token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 PERFIL DEL USUARIO ACTUAL
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Logout
function logout(req, res) {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
}

module.exports = {login, register, getProfile, logout}
