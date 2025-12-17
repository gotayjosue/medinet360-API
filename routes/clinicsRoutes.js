const express = require("express");
const { getClinicById } = require("../controllers/clinicsController.js");
const { requireAuth } = require("../middleware/requireAuth.js");

const router = express.Router();

router.get("/:id", requireAuth, getClinicById);

module.exports = router;
