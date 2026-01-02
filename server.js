const express = require('express');
const app = express();
const routes = require('./routes/routes.js');
const { connectToDatabase } = require('./models/database.js');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

// Rutas API
const authRoutes = require("./routes/authRoutes.js");
const patientsRoutes = require("./routes/patientsRoutes.js");
const appointmentsRoutes = require("./routes/appointmentsRoutes.js");
const clinicsRoutes = require("./routes/clinicsRoutes.js");
const assistantRoutes = require("./routes/assistantRoutes.js");
const paddleRoutes = require("./routes/paddleRoutes.js");
const reportsRoutes = require("./routes/reportsRoutes.js");

// Configuración
app.use(session({
  secret: process.env.SESSION_SECRET || 'MySecretKey',
  resave: false,
  saveUninitialized: false
}));

app.use(express.static('public'));

// Modificar express.json para guardar rawBody para webhooks
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/paddle/webhook')) {
      req.rawBody = buf.toString();
    }
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(flash());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://medinet360.netlify.app",
  "https://medinet360.com"
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'paddle-signature'], // Allow paddle-signature
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// Conexión a base de datos (una sola vez)
connectToDatabase()
  .then(() => console.log("✅ MongoDB connected"))
  .catch((e) => console.error("❌ MongoDB connection error:", e));

// Rutas
app.use("/", routes);
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/clinic", clinicsRoutes);
app.use("/api/assistants", assistantRoutes);
app.use("/api/paddle", paddleRoutes);
app.use("/api/reports", reportsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something broke!');
});

// ⚠️ En lugar de app.listen(), exportamos el servidor
module.exports = app;


