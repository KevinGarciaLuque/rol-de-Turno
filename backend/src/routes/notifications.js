const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendMail, mailEnabled } = require('../utils/mailer');

router.use(authenticate);

// POST /api/notifications/test  { to }  → envía un correo de prueba (solo admin)
router.post('/test', requireRole('admin'), async (req, res, next) => {
  try {
    const to = (req.body.to || '').trim();
    if (!to) return res.status(400).json({ error: 'Indica un correo destino' });
    if (!mailEnabled()) {
      return res.json({ enabled: false, sent: false, message: 'El correo no está configurado (faltan las variables SMTP_*).' });
    }
    const ok = await sendMail(to, 'Prueba de correo · Rol de Turno HMEP',
      'Este es un correo de prueba del sistema Rol de Turno HMEP.\nSi lo recibiste, la configuración SMTP funciona correctamente. ✅');
    res.json({ enabled: true, sent: ok, message: ok ? 'Correo de prueba enviado.' : 'No se pudo enviar (revisa las credenciales SMTP).' });
  } catch (e) { next(e); }
});

// GET /api/notifications  → lista del usuario en sesión (no leídas primero)
router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(
      `SELECT * FROM notifications WHERE user_id=? ORDER BY is_read ASC, created_at DESC LIMIT 50`,
      req.user.id
    );
    const unread = rows.filter(r => !r.is_read).length;
    res.json({ unread, items: rows });
  } catch (e) { next(e); }
});

// PUT /api/notifications/:id/read  → marca una como leída
router.put('/:id/read', async (req, res, next) => {
  try {
    const db = await getDb();
    await db.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// PUT /api/notifications/read-all  → marca todas como leídas
router.put('/read-all', async (req, res, next) => {
  try {
    const db = await getDb();
    await db.run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
