const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../database/db');
const { signToken, authenticate } = require('../middleware/auth');

// Devuelve los department_id asignados a un usuario (vacío = admin ve todo)
async function getUserDepartments(db, userId) {
  const rows = await db.all('SELECT department_id FROM user_departments WHERE user_id = ?', userId);
  return rows.map(r => r.department_id);
}

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', username);
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const departments = await getUserDepartments(db, user.id);
    const token = signToken(user);

    res.json({
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, departments },
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me  → datos del usuario en sesión (revalida contra la BD)
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?', req.user.id);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Sesión inválida' });

    const departments = await getUserDepartments(db, user.id);
    res.json({ user: { ...user, departments } });
  } catch (e) { next(e); }
});

module.exports = router;
