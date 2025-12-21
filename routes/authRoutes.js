const express = require("express");
const { register, login, getProfile, logout, updateProfile, forgotPassword, resetPassword } = require("../controllers/authController.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const validate = require("../middleware/userValidate.js");
const router = express.Router();

// Registro de usuarios
router.post("/register", validate.userValidationRules(), validate.check, register);

// Login
router.post("/login", login);

// Perfil del usuario autenticado
router.get("/profile", requireAuth, getProfile);

// Actualizar nombre, apellido y correo
router.put("/profile/:id", requireAuth, updateProfile);

// Recuperación de contraseña
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", validate.userValidationRules(), validate.check, resetPassword);

// Logout (protected) - increment tokenVersion to invalidate existing JWTs
router.get("/logout", requireAuth, logout);

module.exports = router;
