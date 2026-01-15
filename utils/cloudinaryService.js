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
        // IMPORTANTE: Para recursos 'raw', Cloudinary requiere la extensión en el public_id.
        // Para imágenes/videos, es mejor no incluirla para permitir transformaciones de formato.
        const publicIdBase = fileName.split(".")[0].replace(/\s+/g, '_'); // Limpiar espacios
        const finalPublicId = resourceType === "raw" ? fileName.replace(/\s+/g, '_') : publicIdBase;

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType,
                public_id: finalPublicId,
                use_filename: true,
                unique_filename: true,
                type: "authenticated", // Asegurar que se suba como autenticado
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
 * @param {string} fileName - Nombre original del archivo (para extraer extensión)
 * @param {number} expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 * @returns {string} - URL firmada
 */
const generateSignedUrl = (publicId, resourceType, fileName, expiresIn = 3600) => {
    const timestamp = Math.floor(Date.now() / 1000) + expiresIn;

    // Extraer extensión del nombre original si existe
    const format = fileName ? fileName.split('.').pop().toLowerCase() : null;

    // Para archivos RAW, Cloudinary NO usa el parámetro 'format' en la URL generada,
    // el public_id ya debe contener la extensión (manejado en uploadFile).
    return cloudinary.url(publicId, {
        resource_type: resourceType,
        type: "authenticated",
        sign_url: true,
        expires_at: timestamp,
        format: resourceType !== "raw" ? format : null,
        secure: true
    });
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

    const format = fileName ? fileName.split('.').pop().toLowerCase() : null;

    // IMPORTANTE: Quitamos f_auto y q_auto para recursos autenticados ya que 
    // a veces interfieren con la generación de la extensión en el path firmado.
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
