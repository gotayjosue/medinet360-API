const express = require('express');
const app = express();
const routes = require('./routes/routes');
const pool = require('./models/database');
const { connectToDatabase } = require('./models/database');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const session = require('express-session');

const authRoutes = require("./routes/authRoutes.js");
const patientsRoutes = require("./routes/patientsRoutes.js");
const appointmentsRoutes = require("./routes/appointmentsRoutes.js");
const clinicsRoutes = require("./routes/clinicsRoutes.js");

app.use(session({
  secret: process.env.SESSION_SECRET || 'MySecretKey',
  resave: false,
  saveUninitialized: false
}));

// Set up view engine
const path = require('path');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

//Middleware
app.use(express.static('public'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

app.use(flash());

// Middleware to make flash messages available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// Connect to the database before starting the server

connectToDatabase()
  .then(() => {
    app.use("/", routes);

    // Rutas principales
    app.use("/api/auth", authRoutes);
    app.use("/api/patients", patientsRoutes);
    app.use("/api/appointments", appointmentsRoutes);
    app.use("/api/clinics", clinicsRoutes);

    // ...tus otras rutas (EJS, auth, etc)
    // app.set("view engine", "ejs"); app.set("views", "./views");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("No se pudo conectar a MongoDB:", e);
    process.exit(1);
  });

app.use((err, req, res, next) => {
    res.status(500).send('Something broke!');
});
