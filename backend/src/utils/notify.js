const { sendMail } = require('./mailer');

// Crea notificaciones in-app para cada usuario y, si hay correo configurado, también envía email.
async function notifyUsers(db, users, { scheduleMonthId = null, type = null, title, body }) {
  for (const u of users) {
    await db.run(
      'INSERT INTO notifications (user_id, schedule_month_id, type, title, body) VALUES (?,?,?,?,?)',
      [u.id, scheduleMonthId, type, title, body]
    );
    if (u.email) sendMail(u.email, title, body); // sin await: no bloquea la respuesta
  }
}

module.exports = { notifyUsers };
