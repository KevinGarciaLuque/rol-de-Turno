const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

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
