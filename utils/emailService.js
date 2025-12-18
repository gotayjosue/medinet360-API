const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");

const mailersend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY,
});
const sentFrom = new Sender(process.env.MAILERSEND_DOMAIN, "Medinet360");

/**
 * Envía un correo de notificación de activación de cuenta.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAccountActivationEmail = async (email, name) => {
  try {
    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(new Recipient(email))
      .setSubject("Cuenta Activada - Medinet360")
      .setHtml(`
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
      `);

    await mailersend.email.send(emailParams);

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
    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(new Recipient(email))
      .setSubject("Cuenta Rechazada - Medinet360")
      .setHtml(`
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
      `);

    await mailersend.email.send(emailParams);

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
    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(new Recipient(email))
      .setSubject("Cuenta Creada - Medinet360")
      .setHtml(`
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
      `);

    await mailersend.email.send(emailParams);

    console.log("📧 Correo de creación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de creación:", error);
    // No lanzamos error para no romper el flujo
  }
};

/**
 * Envía un correo de notificación de creación de cuenta para doctores.
 * @param {string} email - Correo del destinatario
 * @param {string} name - Nombre del usuario
 */
const sendAssistantAccountCreationEmail = async (email, name) => {
  try {
    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(new Recipient(email))
      .setSubject("Cuenta Creada - Medinet360")
      .setHtml(`
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
      `);

    await mailersend.email.send(emailParams);

    console.log("📧 Correo de creación enviado a:", email);
  } catch (error) {
    console.error("❌ Error enviando correo de creación:", error);
    // No lanzamos error para no romper el flujo
  }
};

module.exports = {
  sendAccountActivationEmail,
  sendAccountRejectionEmail,
  sendDoctorAccountCreationEmail,
  sendAssistantAccountCreationEmail,
};
