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

// Si la cuenta está vinculada a una empleada, devuelve sus datos básicos (para la vista "Mi Horario")
async function getLinkedEmployee(db, employeeId) {
  if (!employeeId) return null;
  const e = await db.get(
    `SELECT e.id, e.name, e.clave, e.category, e.role, e.department_id, d.name AS department_name
     FROM employees e JOIN departments d ON d.id = e.department_id
     WHERE e.id = ? AND e.is_active = 1`,
    employeeId
  );
  return e || null;
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
    const employee = await getLinkedEmployee(db, user.employee_id);
    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id, username: user.username, full_name: user.full_name, role: user.role,
        departments, employee_id: user.employee_id || null, employee,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me  → datos del usuario en sesión (revalida contra la BD)
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT id, username, full_name, role, is_active, employee_id FROM users WHERE id = ?', req.user.id);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Sesión inválida' });

    const departments = await getUserDepartments(db, user.id);
    const employee = await getLinkedEmployee(db, user.employee_id);
    res.json({ user: { ...user, departments, employee } });
  } catch (e) { next(e); }
});

module.exports = router;
