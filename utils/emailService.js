const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Función interna para enviar correos usando Resend
 * @param {Object} params - Parámetros del correo
 * @param {string} params.to - Destinatario
 * @param {string} params.subject - Asunto
 * @param {string} params.html - Contenido HTML
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "Medinet360 <noreply@medinet360.com>", // Cambia esto a tu dominio verificado cuando esté listo
      to: to,
      subject: subject,
      html: html,
    });

    if (error) {
      console.error("❌ Error enviando correo con Resend:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error en sendEmail:", error);
    throw error;
  }
};

/**
 * Envía un correo de notificación de activación de cuenta.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAccountActivationEmail = async (email, name) => {
  try {
    await sendEmail({
      to: email,
      subject: "Cuenta Activada - Medinet360",
      html: `
        <h1>¡Hola ${name}!</h1>
        <p>Tu cuenta de asistente ha sido aprobada por el doctor.</p>
        <p>
          Ya puedes 
          <a href="https://medinet360.netlify.app/signin">
            iniciar sesión
          </a> 
          en la plataforma.
        </p>
        <br />
        <p>Saludos,</p>
        <p><strong>El equipo de Medinet360</strong></p>
      `,
    });
    console.log("📧 Correo de activación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de activación:", error);
    // No lanzamos error para no romper el flujo
  }
};

/**
 * Envía un correo de notificación de rechazo de cuenta.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAccountRejectionEmail = async (email, name) => {
  try {
    await sendEmail({
      to: email,
      subject: "Cuenta Rechazada - Medinet360",
      html: `
        <h1>Hola ${name}</h1>
        <p>
          Lamentamos informarte que tu solicitud de cuenta de asistente
          no ha sido aprobada.
        </p>
        <p>
          Si crees que esto es un error, por favor contacta al administrador
          de la clínica.
        </p>
        <br />
        <p>Saludos,</p>
        <p><strong>El equipo de Medinet360</strong></p>
      `,
    });
    console.log("📧 Correo de rechazo enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de rechazo:", error);
  }
};

/**
 * Envía un correo de notificación de creación de cuenta para doctores.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendDoctorAccountCreationEmail = async (email, name) => {
  try {
    await sendEmail({
      to: email,
      subject: "Cuenta Creada - Medinet360",
      html: `
        <h1>¡Hola ${name}!</h1>
        <p>Tu cuenta ha sido creada exitosamente.</p>
        <p>
          Ya puedes 
          <a href="https://medinet360.netlify.app/signin">
            iniciar sesión
          </a> 
          en la plataforma.
        </p>
        <br />
        <p>Saludos,</p>
        <p><strong>El equipo de Medinet360</strong></p>
      `,
    });
    console.log("📧 Correo de creación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de creación:", error);
    // No lanzamos error para no romper el flujo
  }
};

/**
 * Envía un correo de notificación de creación de cuenta para asistentes.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAssistantAccountCreationEmail = async (email, name) => {
  try {
    await sendEmail({
      to: email,
      subject: "Cuenta Creada - Medinet360",
      html: `
        <h1>¡Hola ${name}!</h1>
        <p>Tu cuenta de asistente ha sido creada exitosamente.</p>
        <p>
          Debes esperar a que el doctor que te asignó apruebe tu cuenta.
        </p>
        <p>
          Se te notificará cuando tu cuenta sea aprobada.
        </p>
        <br />
        <p>Saludos,</p>
        <p><strong>El equipo de Medinet360</strong></p>
      `,
    });
    console.log("📧 Correo de creación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de creación:", error);
    // No lanzamos error para no romper el flujo
  }
};

/**
 * Envía un correo con el enlace para restablecer la contraseña.
 * @param {string} email - Correo del destinatario
 * @param {string} resetUrl - URL para restablecer la contraseña
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    await sendEmail({
      to: email,
      subject: "Recuperación de Contraseña - Medinet360",
      html: `
        <h1>Recuperación de Contraseña</h1>
        <p>Has solicitado restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para continuar:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
        <p>Si no solicitaste esto, puedes ignorar este correo.</p>
        <br />
        <p>Saludos,</p>
        <p><strong>El equipo de Medinet360</strong></p>
      `,
    });
    console.log("📧 Correo de recuperación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de recuperación:", error);
  }
};

/**
 * Envía un correo de verificación de cuenta.
 * @param {string} email - Correo del destinatario
 * @param {string} verificationUrl - URL para verificar la cuenta
 */
const sendVerificationEmail = async (email, verificationUrl) => {
  try {
    await sendEmail({
      to: email,
      subject: "Verifica tu cuenta - Medinet360",
      html: `
        <h1>¡Bienvenido a Medinet360!</h1>
        <p>Gracias por registrarte. Por favor verifica tu correo electrónico para activar tu cuenta.</p>
        <p>Haz clic en el siguiente enlace:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Verificar Correo</a>
        <p>Si no te registraste en Medinet360, puedes ignorar este correo.</p>
        <br />
        <p>Saludos,</p>
        <p><strong>El equipo de Medinet360</strong></p>
      `,
    });
    console.log("📧 Correo de verificación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de verificación:", error);
  }
};

module.exports = {
  sendAccountActivationEmail,
  sendAccountRejectionEmail,
  sendDoctorAccountCreationEmail,
  sendAssistantAccountCreationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
