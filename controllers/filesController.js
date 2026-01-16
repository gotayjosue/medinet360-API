const PatientFile = require("../models/PatientFile");
const Patient = require("../models/Patient");
const cloudinaryService = require("../utils/cloudinaryService");
const { formatBytes } = require("../middleware/planLimits");

/**
 * Determina el tipo de recurso de Cloudinary según el MIME type
 */
const getResourceType = (mimeType) => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    return "raw"; // PDFs, documentos, etc.
};

/**
 * Sube un archivo a Cloudinary y guarda metadata en MongoDB
 * POST /api/files/upload
 */
const uploadFile = async (req, res) => {
    try {
        const { patientId, category, description } = req.body;
        const file = req.file;

        if (req.fileValidationError) {
            return res.status(400).json({ error: req.fileValidationError });
        }

        if (!file) {
            return res.status(400).json({ error: "No se proporcionó ningún archivo" });
        }

        if (!patientId) {
            return res.status(400).json({ error: "patientId es requerido" });
        }

        // Verificar que el paciente existe y pertenece a la clínica del usuario
        const patient = await Patient.findOne({
            _id: patientId,
            clinicId: req.user.clinicId,
        });

        if (!patient) {
            return res.status(404).json({
                error: "Paciente no encontrado o no pertenece a tu clínica",
            });
        }

        // Determinar tipo de recurso
        const resourceType = getResourceType(file.mimetype);

        // Crear carpeta organizada: medinet360/{clinicId}/{patientId}
        const folder = `medinet360/${req.user.clinicId}/${patientId}`;

        // Subir a Cloudinary
        const uploadResult = await cloudinaryService.uploadFile(
            file.buffer,
            folder,
            resourceType,
            file.originalname
        );

        // Guardar metadata en MongoDB
        const patientFile = new PatientFile({
            patientId,
            clinicId: req.user.clinicId,
            uploadedBy: req.user._id,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileCategory: category || "other",
            cloudinaryPublicId: uploadResult.public_id,
            cloudinaryUrl: uploadResult.secure_url,
            cloudinaryResourceType: resourceType,
            fileSizeBytes: file.size,
            description: description || "",
        });

        await patientFile.save();

        // Generar URL firmada para respuesta
        const signedUrl = cloudinaryService.generateSignedUrl(
            uploadResult.public_id,
            resourceType,
            file.originalname // Pasar nombre original para la extensión
        );

        res.status(201).json({
            message: "Archivo subido exitosamente",
            file: {
                _id: patientFile._id,
                fileName: patientFile.fileName,
                fileType: patientFile.fileType,
                fileCategory: patientFile.fileCategory,
                fileSizeBytes: patientFile.fileSizeBytes,
                fileSize: formatBytes(patientFile.fileSizeBytes),
                description: patientFile.description,
                signedUrl,
                uploadedBy: {
                    _id: req.user._id,
                    name: req.user.name,
                },
                createdAt: patientFile.createdAt,
            },
        });
    } catch (error) {
        console.error("❌ Error uploading file:", error);
        res.status(500).json({
            error: "Error al subir archivo",
            details: error.message,
        });
    }
};

/**
 * Obtiene todos los archivos de un paciente
 * GET /api/files/patient/:patientId
 */
const getPatientFiles = async (req, res) => {
    try {
        const { patientId } = req.params;

        // Verificar que el paciente pertenece a la clínica del usuario
        const patient = await Patient.findOne({
            _id: patientId,
            clinicId: req.user.clinicId,
        });

        if (!patient) {
            return res.status(404).json({
                error: "Paciente no encontrado o no pertenece a tu clínica",
            });
        }

        // Obtener archivos del paciente
        const files = await PatientFile.find({
            patientId,
            clinicId: req.user.clinicId,
        })
            .populate("uploadedBy", "name email")
            .sort({ createdAt: -1 });

        // Generar URLs firmadas para cada archivo
        const filesWithUrls = files.map((file) => {
            const signedUrl = cloudinaryService.generateSignedUrl(
                file.cloudinaryPublicId,
                file.cloudinaryResourceType,
                file.fileName
            );

            // Generar miniatura solo para imágenes
            let thumbnailUrl = null;
            if (file.cloudinaryResourceType === "image") {
                thumbnailUrl = cloudinaryService.generateThumbnailUrl(
                    file.cloudinaryPublicId,
                    file.fileName
                );
            }

            return {
                _id: file._id,
                fileName: file.fileName,
                fileType: file.fileType,
                fileCategory: file.fileCategory,
                fileSizeBytes: file.fileSizeBytes,
                fileSize: formatBytes(file.fileSizeBytes),
                description: file.description,
                signedUrl,
                thumbnailUrl,
                uploadedBy: file.uploadedBy,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
            };
        });

        res.status(200).json({
            patientId,
            totalFiles: filesWithUrls.length,
            files: filesWithUrls,
        });
    } catch (error) {
        console.error("❌ Error getting patient files:", error);
        res.status(500).json({
            error: "Error al obtener archivos del paciente",
            details: error.message,
        });
    }
};

/**
 * Obtiene un archivo específico por ID
 * GET /api/files/:fileId
 */
const getFileById = async (req, res) => {
    try {
        const { fileId } = req.params;

        const file = await PatientFile.findOne({
            _id: fileId,
            clinicId: req.user.clinicId,
        }).populate("uploadedBy", "name email");

        if (!file) {
            return res.status(404).json({
                error: "Archivo no encontrado o no pertenece a tu clínica",
            });
        }

        // Generar URL firmada
        const signedUrl = cloudinaryService.generateSignedUrl(
            file.cloudinaryPublicId,
            file.cloudinaryResourceType,
            file.fileName
        );

        res.status(200).json({
            _id: file._id,
            fileName: file.fileName,
            fileType: file.fileType,
            fileCategory: file.fileCategory,
            fileSizeBytes: file.fileSizeBytes,
            fileSize: formatBytes(file.fileSizeBytes),
            description: file.description,
            signedUrl,
            uploadedBy: file.uploadedBy,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
        });
    } catch (error) {
        console.error("❌ Error getting file:", error);
        res.status(500).json({
            error: "Error al obtener archivo",
            details: error.message,
        });
    }
};

/**
 * Actualiza descripción/categoría de un archivo, opcionalmente reemplaza el archivo
 * PUT /api/files/:fileId
 */
const updateFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const { category, description } = req.body;
        const newFile = req.file;

        // Buscar archivo existente
        const existingFile = await PatientFile.findOne({
            _id: fileId,
            clinicId: req.user.clinicId,
        });

        if (!existingFile) {
            return res.status(404).json({
                error: "Archivo no encontrado o no pertenece a tu clínica",
            });
        }

        // Si hay error de validación de archivo nuevo
        if (req.fileValidationError) {
            return res.status(400).json({ error: req.fileValidationError });
        }

        // Si se proporciona un nuevo archivo, reemplazar en Cloudinary
        if (newFile) {
            // Eliminar archivo anterior de Cloudinary
            await cloudinaryService.deleteFile(
                existingFile.cloudinaryPublicId,
                existingFile.cloudinaryResourceType
            );

            // Subir nuevo archivo
            const resourceType = getResourceType(newFile.mimetype);
            const folder = `medinet360/${req.user.clinicId}/${existingFile.patientId}`;

            const uploadResult = await cloudinaryService.uploadFile(
                newFile.buffer,
                folder,
                resourceType,
                newFile.originalname
            );

            // Actualizar campos del archivo
            existingFile.fileName = newFile.originalname;
            existingFile.fileType = newFile.mimetype;
            existingFile.cloudinaryPublicId = uploadResult.public_id;
            existingFile.cloudinaryUrl = uploadResult.secure_url;
            existingFile.cloudinaryResourceType = resourceType;
            existingFile.fileSizeBytes = newFile.size;
        }

        // Actualizar descripción y categoría si se proporcionan
        if (category) existingFile.fileCategory = category;
        if (description !== undefined) existingFile.description = description;

        await existingFile.save();

        // Generar URL firmada
        const signedUrl = cloudinaryService.generateSignedUrl(
            existingFile.cloudinaryPublicId,
            existingFile.cloudinaryResourceType,
            existingFile.fileName
        );

        res.status(200).json({
            message: "Archivo actualizado exitosamente",
            file: {
                _id: existingFile._id,
                fileName: existingFile.fileName,
                fileType: existingFile.fileType,
                fileCategory: existingFile.fileCategory,
                fileSizeBytes: existingFile.fileSizeBytes,
                fileSize: formatBytes(existingFile.fileSizeBytes),
                description: existingFile.description,
                signedUrl,
                updatedAt: existingFile.updatedAt,
            },
        });
    } catch (error) {
        console.error("❌ Error updating file:", error);
        res.status(500).json({
            error: "Error al actualizar archivo",
            details: error.message,
        });
    }
};

/**
 * Elimina un archivo de Cloudinary y MongoDB
 * DELETE /api/files/:fileId
 */
const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;

        const file = await PatientFile.findOne({
            _id: fileId,
            clinicId: req.user.clinicId,
        });

        if (!file) {
            return res.status(404).json({
                error: "Archivo no encontrado o no pertenece a tu clínica",
            });
        }

        // Eliminar de Cloudinary
        await cloudinaryService.deleteFile(
            file.cloudinaryPublicId,
            file.cloudinaryResourceType
        );

        // Eliminar de MongoDB
        await PatientFile.deleteOne({ _id: fileId });

        res.status(200).json({
            message: "Archivo eliminado exitosamente",
            deletedFile: {
                _id: file._id,
                fileName: file.fileName,
            },
        });
    } catch (error) {
        console.error("❌ Error deleting file:", error);
        res.status(500).json({
            error: "Error al eliminar archivo",
            details: error.message,
        });
    }
};

/**
 * Obtiene estadísticas de almacenamiento de la clínica
 * GET /api/files/stats/storage
 */
const getClinicStorageStats = async (req, res) => {
    try {
        const clinicId = req.user.clinicId;

        // Obtener todos los archivos de la clínica
        const files = await PatientFile.find({ clinicId });

        const totalFiles = files.length;
        const usedBytes = files.reduce((sum, file) => sum + file.fileSizeBytes, 0);

        // Obtener límites del plan
        const { PLAN_LIMITS } = require("../middleware/planLimits");
        const plan = req.clinic?.plan?.toLowerCase() || "free";
        const limits = PLAN_LIMITS[plan];

        const limitBytes = limits?.maxStorageBytes || 0;
        const usedPercentage = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;

        res.status(200).json({
            plan,
            totalFiles,
            usedBytes,
            usedStorage: formatBytes(usedBytes),
            limitBytes,
            limitStorage: formatBytes(limitBytes),
            availableBytes: Math.max(0, limitBytes - usedBytes),
            availableStorage: formatBytes(Math.max(0, limitBytes - usedBytes)),
            usedPercentage: Math.round(usedPercentage * 100) / 100,
        });
    } catch (error) {
        console.error("❌ Error getting storage stats:", error);
        res.status(500).json({
            error: "Error al obtener estadísticas de almacenamiento",
            details: error.message,
        });
    }
};

module.exports = {
    uploadFile,
    getPatientFiles,
    getFileById,
    updateFile,
    deleteFile,
    getClinicStorageStats,
};
