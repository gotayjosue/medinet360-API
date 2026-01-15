const cloudinary = require("cloudinary").v2;

// Configurar Cloudinary con variables de entorno
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube un archivo a Cloudinary
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} folder - Carpeta en Cloudinary (ej: medinet360/clinicId/patientId)
 * @param {string} resourceType - Tipo de recurso: 'image', 'video', 'raw'
 * @param {string} fileName - Nombre original del archivo
 * @returns {Promise<Object>} - Resultado de Cloudinary con public_id, url, etc.
 */
const uploadFile = async (fileBuffer, folder, resourceType, fileName) => {
    return new Promise((resolve, reject) => {
        // Obtenemos el nombre sin extensión de forma robusta
        const parts = fileName.split(".");
        const publicIdBase = parts.slice(0, -1).join(".").replace(/\s+/g, '_') || parts[0].replace(/\s+/g, '_');

        // Para RAW forzamos la extensión en el public_id, para imágenes no.
        const finalPublicId = resourceType === "raw" ? fileName.replace(/\s+/g, '_') : publicIdBase;

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType,
                public_id: finalPublicId,
                use_filename: true,
                unique_filename: true,
                type: "authenticated",
            },
            (error, result) => {
                if (error) {
                    console.error("❌ Cloudinary upload error:", error);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Elimina un archivo de Cloudinary
 * @param {string} publicId - Public ID del archivo en Cloudinary
 * @param {string} resourceType - Tipo de recurso: 'image', 'video', 'raw'
 * @returns {Promise<Object>} - Resultado de la eliminación
 */
const deleteFile = async (publicId, resourceType) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            type: "authenticated",
        });
        return result;
    } catch (error) {
        console.error("❌ Cloudinary delete error:", error);
        throw error;
    }
};

/**
 * Genera una URL firmada temporal para acceso seguro
 * @param {string} publicId - Public ID del archivo
 * @param {string} resourceType - Tipo de recurso: 'image', 'video', 'raw'
 * @param {string} fileName - Nombre original del archivo
 * @param {number} expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 * @returns {string} - URL firmada
 */
const generateSignedUrl = (publicId, resourceType, fileName, expiresIn = 3600) => {
    const timestamp = Math.floor(Date.now() / 1000) + expiresIn;

    // Configuración base de la URL
    const urlOptions = {
        resource_type: resourceType,
        type: "authenticated",
        sign_url: true,
        expires_at: timestamp,
        secure: true,
    };

    // Si es un archivo RAW (PDF, etc.), NO debemos pasar 'format' porque la extensión ya está en el public_id.
    // Además, forzamos descarga con flags para evitar el error "untrusted customer" en PDFs.
    if (resourceType === "raw") {
        urlOptions.flags = "attachment";
        // Algunas versiones del SDK prefieren esta opción directa para forzar descarga
        // urlOptions.attachment = true; 
    } else {
        // Para imágenes sí pasamos el formato para permitir transformaciones
        if (fileName && fileName.includes('.')) {
            urlOptions.format = fileName.split('.').pop().toLowerCase();
        }
    }

    return cloudinary.url(publicId, urlOptions);
};

/**
 * Genera URL firmada para miniatura (solo imágenes)
 * @param {string} publicId - Public ID del archivo
 * @param {string} fileName - Nombre original
 * @param {number} width - Ancho de la miniatura
 * @param {number} height - Alto de la miniatura
 * @param {number} expiresIn - Tiempo de expiración en segundos
 * @returns {string} - URL firmada de miniatura
 */
const generateThumbnailUrl = (publicId, fileName, width = 150, height = 150, expiresIn = 3600) => {
    const timestamp = Math.floor(Date.now() / 1000) + expiresIn;
    const format = fileName && fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : null;

    return cloudinary.url(publicId, {
        resource_type: "image",
        type: "authenticated",
        sign_url: true,
        expires_at: timestamp,
        format: format,
        secure: true,
        transformation: [
            { width, height, crop: "fill", gravity: "center" }
        ],
    });
};

/**
 * Obtiene información de un recurso en Cloudinary
 * @param {string} publicId - Public ID del archivo
 * @param {string} resourceType - Tipo de recurso
 * @returns {Promise<Object>} - Información del recurso
 */
const getResourceInfo = async (publicId, resourceType) => {
    try {
        const result = await cloudinary.api.resource(publicId, {
            resource_type: resourceType,
        });
        return result;
    } catch (error) {
        console.error("❌ Cloudinary resource info error:", error);
        throw error;
    }
};

module.exports = {
    uploadFile,
    deleteFile,
    generateSignedUrl,
    generateThumbnailUrl,
    getResourceInfo,
};
