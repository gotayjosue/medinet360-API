const express = require("express");
const {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
} = require("../controllers/patientsController.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const validate = require("../middleware/patientValidate.js");

const router = express.Router();

// router.use(requireAuth); // todas requieren estar logueado

router.get("/", getPatients);
router.get("/:id", getPatientById);
router.post("/", validate.patientValidationRules(), validate.check, createPatient);
router.put("/:id", validate.patientValidationRules(), validate.check, updatePatient);
router.delete("/:id", deletePatient);

module.exports = router;
