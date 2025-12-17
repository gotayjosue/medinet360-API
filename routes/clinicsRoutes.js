const express = require("express");
const { getClinicById, updateCustomFieldsTemplate, updateClinic } = require("../controllers/clinicsController.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const validate = require("../middleware/clinicValidate.js");

const router = express.Router();

router.get("/:id", requireAuth, getClinicById);
router.put("/:id", requireAuth, validate.clinicValidateRules(), validate.check, updateClinic);
router.put("/:id/custom-fields", requireAuth, updateCustomFieldsTemplate);

module.exports = router;
