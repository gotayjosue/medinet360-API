const Clinic = require("../models/Clinic");
const PatientFile = require("../models/PatientFile");

// Límites de almacenamiento por plan
const PLAN_LIMITS = {
    free: {
        canUpload: false,
        maxFileSizeBytes: 0,
        maxStorageBytes: 0,
    },
    clinic_pro: {
        canUpload: true,
        maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
        maxStorageBytes: 500 * 1024 * 1024, // 500 MB
    },
    clinic_plus: {
        canUpload: true,
        maxFileSizeBytes: 200 * 1024 * 1024, // 200 MB
        maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    },
};

/**
 * Middleware para verificar si el plan permite subir archivos
 */
const checkFileUploadPermission = async (req, res, next) => {
    try {
        const clinic = await Clinic.findById(req.user.clinicId);
        if (!clinic) {
            return res.status(404).json({ error: "Clínica no encontrada" });
        }

        const plan = clinic.plan.toLowerCase();
        const limits = PLAN_LIMITS[plan];

        if (!limits || !limits.canUpload) {
            return res.status(403).json({
                error: "Tu plan actual no permite subir archivos",
                message: "Actualiza a Clinic Pro o Clinic Plus para acceder a esta funcionalidad",
                currentPlan: plan,
            });
        }

        // Guardar límites en req para uso posterior
        req.planLimits = limits;
        req.clinic = clinic;
        next();
    } catch (error) {
        console.error("❌ Error checking file upload permission:", error);
        res.status(500).json({ error: "Error al verificar permisos de plan" });
    }
};

/**
 * Middleware para validar el tamaño del archivo según el plan
 */
const checkFileSizeLimit = (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: "No se proporcionó ningún archivo" });
    }

    const fileSize = req.file.size;
    const maxSize = req.planLimits.maxFileSizeBytes;

    if (fileSize > maxSize) {
        return res.status(413).json({
            error: "Archivo demasiado grande",
            message: `El tamaño máximo permitido para tu plan es ${formatBytes(maxSize)}`,
            fileSize: formatBytes(fileSize),
            maxSize: formatBytes(maxSize),
            currentPlan: req.clinic.plan,
        });
    }

    next();
};

/**
 * Middleware para verificar el límite total de almacenamiento de la clínica
 */
const checkStorageLimit = async (req, res, next) => {
    try {
        const clinicId = req.user.clinicId;

        // Calcular almacenamiento total usado por la clínica
        const files = await PatientFile.find({ clinicId });
        const totalUsedBytes = files.reduce((sum, file) => sum + file.fileSizeBytes, 0);

        const newFileSize = req.file.size;
        const maxStorage = req.planLimits.maxStorageBytes;

        if (totalUsedBytes + newFileSize > maxStorage) {
            return res.status(507).json({
                error: "Límite de almacenamiento alcanzado",
                message: `Has alcanzado el límite de almacenamiento de tu plan (${formatBytes(maxStorage)})`,
                usedStorage: formatBytes(totalUsedBytes),
                maxStorage: formatBytes(maxStorage),
                availableStorage: formatBytes(maxStorage - totalUsedBytes),
                currentPlan: req.clinic.plan,
            });
        }

        // Guardar estadísticas para uso posterior
        req.storageStats = {
            usedBytes: totalUsedBytes,
            maxBytes: maxStorage,
            availableBytes: maxStorage - totalUsedBytes,
        };

        next();
    } catch (error) {
        console.error("❌ Error checking storage limit:", error);
        res.status(500).json({ error: "Error al verificar límite de almacenamiento" });
    }
};

/**
 * Formatea bytes a formato legible (KB, MB, GB)
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
};

module.exports = {
    checkFileUploadPermission,
    checkFileSizeLimit,
    checkStorageLimit,
    PLAN_LIMITS,
    formatBytes,
};
