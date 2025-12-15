const express = require("express");
const router = express.Router();
const assistantsController = require("../controllers/assistantsController");
const { requireAuth } = require("../middleware/requireAuth");

router.get("/pending", requireAuth, assistantsController.getPendingAssistants);
router.get("/all", requireAuth, assistantsController.getAllAssistants);
router.post("/approve", requireAuth, assistantsController.approveAssistant);
router.post("/reject", requireAuth, assistantsController.rejectAssistant);
router.put("/update-permissions/:assistantId", requireAuth, assistantsController.updateAssistantPermissions);
router.get("/permissions/:assistantId", requireAuth, assistantsController.getAssistantPermissions);

module.exports = router;
