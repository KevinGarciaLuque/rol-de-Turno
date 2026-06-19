const nodemailer = require('nodemailer');

// Correo OPCIONAL. Si no hay SMTP configurado en el .env, no envía nada
// (la app sigue funcionando con las notificaciones in-app / campanita).
let _transporter; // undefined = sin inicializar, false = no configurado

function getTransporter() {
  if (_transporter !== undefined) return _transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    _transporter = false;
    return false;
  }
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true', // true para 465
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

const mailEnabled = () => getTransporter() !== false;

async function sendMail(to, subject, text) {
  const t = getTransporter();
  if (!t || !to) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || `Rol de Turno HMEP <${process.env.SMTP_USER}>`,
      to, subject, text,
    });
    return true;
  } catch (e) {
    console.error('Error enviando correo:', e.message);
    return false;
  }
}

module.exports = { sendMail, mailEnabled };
