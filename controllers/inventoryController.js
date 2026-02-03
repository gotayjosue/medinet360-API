const InventoryItem = require("../models/InventoryItem");

// 🔹 Obtener todos los items de inventario de la clínica
const getInventory = async (req, res) => {
    try {
        const items = await InventoryItem.find({ clinicId: req.user.clinicId });
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 🔹 Obtener un item por ID
const getInventoryItemById = async (req, res) => {
    try {
        const item = await InventoryItem.findOne({
            _id: req.params.id,
            clinicId: req.user.clinicId,
        });
        if (!item) return res.status(404).json({ error: "Item no encontrado" });
        res.status(200).json(item);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 🔹 Crear item de inventario
const createInventoryItem = async (req, res) => {
    try {
        const { name, sku, description, category, quantity, unit, minStock, price, expirationDate } = req.body;

        const item = await InventoryItem.create({
            name,
            sku,
            description,
            category,
            quantity,
            unit,
            minStock,
            price,
            expirationDate,
            clinicId: req.user.clinicId,
            createdBy: req.user._id,
        });
        res.status(201).json(item);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 🔹 Actualizar item de inventario
const updateInventoryItem = async (req, res) => {
    try {
        const item = await InventoryItem.findOneAndUpdate(
            { _id: req.params.id, clinicId: req.user.clinicId },
            req.body,
            { new: true }
        );
        if (!item) return res.status(404).json({ error: "Item no encontrado" });
        res.status(200).json(item);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 🔹 Eliminar item de inventario
const deleteInventoryItem = async (req, res) => {
    try {
        const item = await InventoryItem.findOneAndDelete({
            _id: req.params.id,
            clinicId: req.user.clinicId,
        });
        if (!item) return res.status(404).json({ error: "Item no encontrado" });
        res.status(200).json({ message: "Item eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getInventory,
    getInventoryItemById,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
};
