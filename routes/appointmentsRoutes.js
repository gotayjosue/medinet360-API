const express = require("express");
const {
  getAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} = require("../controllers/appointmentsController.js");
const { requireAuth } = require("../middleware/requireAuth.js");

const router = express.Router();

router.use(requireAuth);

router.get("/", getAppointments);
router.post("/", createAppointment);
router.put("/:id", updateAppointment);
router.delete("/:id", deleteAppointment);

module.exports = router;
