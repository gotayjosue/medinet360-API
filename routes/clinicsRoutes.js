const express = require("express");
const { getClinicById, updateCustomFieldsTemplate } = require("../controllers/clinicsController.js");
const { requireAuth } = require("../middleware/requireAuth.js");

const router = express.Router();

router.get("/:id", requireAuth, getClinicById);
router.put("/:id/custom-fields", requireAuth, updateCustomFieldsTemplate);

module.exports = router;
