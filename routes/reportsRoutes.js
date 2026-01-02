const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const reportsController = require('../controllers/reportsController');

// All routes require authentication
router.use(requireAuth);

// Export patients list as CSV
router.get('/patients/csv', reportsController.exportPatientsCSV);

// Export patients list as PDF
router.get('/patients/pdf', reportsController.exportPatientsPDF);

// Generate clinical PDF for a specific patient
router.get('/clinical/:patientId', reportsController.generateClinicalPDF);

// Generate history PDF for a patient
router.get('/history/:patientId', reportsController.generateHistoryPDF);

module.exports = router;
