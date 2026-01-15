const express = require("express");
const router = express.Router();
const multer = require("multer");
const { requireAuth } = require("../middleware/requireAuth");
const checkPermission = require("../middleware/checkPermissions");
const {
    checkFileUploadPermission,
    checkFileSizeLimit,
    checkStorageLimit,
} = require("../middleware/planLimits");
const {
    uploadFile,
    getPatientFiles,
    getFileById,
    updateFile,
    deleteFile,
    getClinicStorageStats,
} = require("../controllers/filesController");

// Configurar multer para manejar archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 200 * 1024 * 1024, // 200 MB máximo (se validará por plan después)
    },
});

/**
 * POST /api/files/upload
 * Sube un archivo a Cloudinary
 * Requiere: autenticación, permiso de gestión de archivos, plan válido
 */
router.post(
    "/upload",
    requireAuth,
    checkPermission("manageFiles"),
    upload.single("file"),
    checkFileUploadPermission,
    checkFileSizeLimit,
    checkStorageLimit,
    uploadFile
);

/**
 * GET /api/files/patient/:patientId
 * Obtiene todos los archivos de un paciente
 * Requiere: autenticación
 */
router.get(
    "/patient/:patientId",
    requireAuth,
    getPatientFiles
);

/**
 * GET /api/files/stats/storage
 * Obtiene estadísticas de almacenamiento de la clínica
 * Requiere: autenticación
 */
router.get(
    "/stats/storage",
    requireAuth,
    checkFileUploadPermission,
    getClinicStorageStats
);

/**
 * GET /api/files/:fileId
 * Obtiene un archivo específico por ID
 * Requiere: autenticación
 */
router.get(
    "/:fileId",
    requireAuth,
    getFileById
);

/**
 * PUT /api/files/:fileId
 * Actualiza descripción/categoría de un archivo, opcionalmente reemplaza el archivo
 * Requiere: autenticación, permiso de gestión de archivos
 */
router.put(
    "/:fileId",
    requireAuth,
    checkPermission("manageFiles"),
    upload.single("file"),
    updateFile
);

/**
 * DELETE /api/files/:fileId
 * Elimina un archivo de Cloudinary y MongoDB
 * Requiere: autenticación, permiso de gestión de archivos
 */
router.delete(
    "/:fileId",
    requireAuth,
    checkPermission("manageFiles"),
    deleteFile
);

module.exports = router;
