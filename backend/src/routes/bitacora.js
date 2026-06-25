const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

// GET /api/bitacora?limit=50&offset=0&action=&from=&to=
router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const where = [];
    const params = [];

    if (req.query.action) {
      where.push('action = ?');
      params.push(req.query.action);
    }
    if (req.query.from) {
      where.push('created_at >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      where.push('created_at <= ?');
      params.push(req.query.to + ' 23:59:59');
    }

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows, countRow] = await Promise.all([
      db.all(
        `SELECT * FROM bitacora ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      db.get(`SELECT COUNT(*) AS total FROM bitacora ${clause}`, params),
    ]);

    // Parsear detail de JSON string a objeto
    for (const r of rows) {
      try { r.detail = JSON.parse(r.detail || '{}'); } catch { r.detail = {}; }
    }

    res.json({ rows, total: countRow?.total || 0 });
  } catch (e) { next(e); }
});

module.exports = router;
