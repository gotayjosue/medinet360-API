const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        sku: { type: String },
        description: { type: String },
        category: { type: String },
        quantity: { type: Number, default: 0 },
        unit: { type: String },
        minStock: { type: Number, default: 0 },
        price: { type: Number },
        expirationDate: { type: String },
        clinicId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Clinic",
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

const InventoryItem = mongoose.model("InventoryItem", inventoryItemSchema);
module.exports = InventoryItem;
