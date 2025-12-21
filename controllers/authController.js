const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");
const Clinic = require("../models/Clinic.js");
const { error } = require("console");
const crypto = require("crypto");
const {
  sendDoctorAccountCreationEmail,
  sendAssistantAccountCreationEmail,
  sendPasswordResetEmail
} = require("../utils/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// 🔹 REGISTRO
const register = async (req, res) => {
  try {
    const { name, lastName, email, password, role, clinicName, clinicId } = req.body;

    // Verificar si el email ya está registrado
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let assignedClinicId = clinicId;
    let userStatus = "active"; // Default

    // Si es doctor: crea nueva clínica
    if (role === "doctor") {
      if (!clinicName) {
        return res.status(400).json({ error: "Debes ingresar el nombre de la clinica" })
      }
      const newClinic = await Clinic.create({
        name: clinicName,
        adminId: null, // lo llenamos después
      });
      assignedClinicId = newClinic._id;
    }

    // Si es ASISTENTE → debe seleccionar una clínica existente
    if (role === "assistant") {
      if (!clinicId)
        return res.status(400).json({ error: "Debes ingresar el ID de una clínica existente" });

      const clinicExists = await Clinic.findById(clinicId);
      if (!clinicExists)
        return res.status(404).json({ error: "La clínica seleccionada no existe" });

      assignedClinicId = clinicId;
      userStatus = "pending"; // Asistentes inician como pendientes
    }

    // Crear usuario
    const user = await User.create({
      name,
      lastName,
      email,
      password: hashedPassword,
      role,
      clinicId: assignedClinicId,
      status: userStatus,
    });

    // Si el usuario es doctor, actualizar clínica con adminId
    if (role === "doctor") {
      await Clinic.findByIdAndUpdate(assignedClinicId, { adminId: user._id });
    }

    // Enviar correo de creación de cuenta
    if (role === "assistant") {
      await sendAssistantAccountCreationEmail(user.email, user.name);
    } else {
      await sendDoctorAccountCreationEmail(user.email, user.name);
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

    // Verificar si la cuenta está pendiente
    if (user.status === "pending") {
      return res.status(403).json({ error: "Tu cuenta está pendiente de aprobación por el doctor." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { userId: user._id, role: user.role, clinicId: user.clinicId, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.status(200).json({ message: "Login exitoso", token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 PERFIL DEL USUARIO ACTUAL
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//Actualizar datos de usuario
const updateProfile = async (req, res) => {
  try {
    const { name, lastName, email } = req.body;
    const clinicId = req.user.clinicId;

    const user = await User.findOneAndUpdate(
      { _id: req.user.id, clinicId },
      {
        name,
        lastName,
        email,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.status(200).json(user);
  } catch (error) {
    //Manejo de email duplicado
    if (error.code === 11000) {
      return res.status(400).json({ error: "El correo ya está en uso" });
    }

    res.status(500).json({ error: error.message });
  }
}

// 🔹 RECUPERAR CONTRASEÑA (Solicitar enlace)
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "No existe un usuario con ese correo electrónico" });
    }

    // Generar token
    const token = crypto.randomBytes(20).toString("hex");

    // Guardar token y expiración (1 hora)
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    // Crear URL de restablecimiento (Ajustar dominio según entorno)
    // Asumiendo que el frontend maneja la ruta /reset-password/:token
    const resetUrl = `https://medinet360.netlify.app/reset-password/${token}`;

    // Enviar correo
    await sendPasswordResetEmail(user.email, resetUrl);

    res.status(200).json({ message: "Correo de recuperación enviado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔹 RESTABLECER CONTRASEÑA (Usar token)
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Verificar que no haya expirado
    });

    if (!user) {
      return res.status(400).json({ error: "El token es inválido o ha expirado" });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Actualizar usuario
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Contraseña restablecida exitosamente" });
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

module.exports = { login, register, getProfile, updateProfile, logout, forgotPassword, resetPassword }
