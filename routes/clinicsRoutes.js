const express = require("express");
const { getClinics } = require("../controllers/clinicsController.js");
const { requireAuth } = require("../middleware/requireAuth.js");

const router = express.Router();

router.get("/", requireAuth, getClinics);

module.exports = router;
