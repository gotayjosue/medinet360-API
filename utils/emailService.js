const nodemailer = require("nodemailer");

// Configurar transporte de correo
// Asegúrate de tener estas variables en tu archivo .env
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail", // Ej: 'gmail', 'hotmail'
    auth: {
        user: process.env.EMAIL_USER, // Tu correo
        pass: process.env.EMAIL_PASS, // Tu contraseña de aplicación
    },
    logger: true,
    debug: true,
});

/**
 * Envía un correo de notificación de activación de cuenta.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAccountActivationEmail = async (email, name) => {
    try {
        const mailOptions = {
            from: `"Medinet360" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Cuenta Activada - Medinet360",
            html: `
        <h1>¡Hola ${name}!</h1>
        <p>Tu cuenta de asistente ha sido aprobada por el doctor.</p>
        <p>Ya puedes <a href="https://medinet360.netlify.app/signin">iniciar sesión</a> en la plataforma.</p>
        <br>
        <p>Saludos,</p>
        <p>El equipo de Medinet360</p>
      `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Correo enviado: " + info.response);
    } catch (error) {
        console.error("Error enviando correo:", error);
        // No lanzamos error para no detener el proceso de aprobación si falla el correo
    }
};

/**
 * Envía un correo de notificación de rechazo de cuenta.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAccountRejectionEmail = async (email, name) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Solicitud de Cuenta - Medinet360",
            html: `
        <h1>Hola ${name}</h1>
        <p>Lamentamos informarte que tu solicitud de cuenta de asistente no ha sido aprobada.</p>
        <p>Si crees que esto es un error, por favor contacta al administrador de la clínica.</p>
        <br>
        <p>Saludos,</p>
        <p>El equipo de Medinet360</p>
      `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Correo de rechazo enviado: " + info.response);
    } catch (error) {
        console.error("Error enviando correo de rechazo:", error);
    }
};

module.exports = { sendAccountActivationEmail, sendAccountRejectionEmail };
