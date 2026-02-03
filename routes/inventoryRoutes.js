const express = require("express");
const {
    getInventory,
    getInventoryItemById,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
} = require("../controllers/inventoryController");
const { requireAuth } = require("../middleware/requireAuth");
const checkPermissions = require("../middleware/checkPermissions");
const validate = require("../middleware/inventoryValidate");

const router = express.Router();

router.use(requireAuth); // Todas requieren estar logueado

router.get("/", checkPermissions("manageInventory"), getInventory);
router.get("/:id", checkPermissions("manageInventory"), getInventoryItemById);
router.post("/", checkPermissions("manageInventory"), validate.inventoryValidationRules(), validate.check, createInventoryItem);
router.put("/:id", checkPermissions("manageInventory"), validate.inventoryValidationRules(), validate.check, updateInventoryItem);
router.delete("/:id", checkPermissions("manageInventory"), deleteInventoryItem);

module.exports = router;
