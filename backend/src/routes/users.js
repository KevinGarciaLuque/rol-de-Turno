const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { POSITIONS } = require('../config/approval');

const VALID_ROLES = ['admin', 'supervisor', 'jefe', 'lector'];

// Normaliza la posición de aprobación: '' o inválida → null
function normPosition(pos) {
  return POSITIONS.includes(pos) ? pos : null;
}

// Normaliza el vínculo con empleada: '' / 0 / inválido → null
function normEmployeeId(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Reemplaza las áreas asignadas a un usuario
async function setUserDepartments(db, userId, departmentIds) {
  await db.run('DELETE FROM user_departments WHERE user_id = ?', userId);
  if (Array.isArray(departmentIds)) {
    for (const did of departmentIds) {
      await db.run('INSERT IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)', [userId, did]);
    }
  }
}

async function getUserDepartments(db, userId) {
  const rows = await db.all('SELECT department_id FROM user_departments WHERE user_id = ?', userId);
  return rows.map(r => r.department_id);
}

// Todas las rutas de aquí en adelante: solo Admin
router.use(authenticate, requireRole('admin'));

// GET /api/users  → lista de usuarios con sus áreas
router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const users = await db.all(
      `SELECT u.id, u.username, u.full_name, u.role, u.email, u.approval_position, u.is_active, u.created_at,
              u.employee_id, e.name AS employee_name,
              (u.signature IS NOT NULL) AS has_signature
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       ORDER BY u.role, u.full_name`
    );
    for (const u of users) u.departments = await getUserDepartments(db, u.id);
    res.json(users);
  } catch (e) { next(e); }
});

// GET /api/users/:id/signature  → devuelve la firma (data URL) del usuario
router.get('/:id/signature', async (req, res, next) => {
  try {
    const db = await getDb();
    const row = await db.get('SELECT signature FROM users WHERE id = ?', req.params.id);
    if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ signature: row.signature || null });
  } catch (e) { next(e); }
});

// POST /api/users  { username, password, full_name, role, departments: [ids] }
router.post('/', async (req, res, next) => {
  try {
    const { username, password, full_name, role, departments, email, approval_position, signature, employee_id } = req.body;
    if (!username || !password || !full_name || !role) {
      return res.status(400).json({ error: 'username, password, full_name y role son requeridos' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${VALID_ROLES.join(', ')}` });
    }

    const db = await getDb();
    const exists = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (exists) return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });

    const empId = normEmployeeId(employee_id);
    if (empId) {
      const emp = await db.get('SELECT id FROM employees WHERE id = ? AND is_active = 1', empId);
      if (!emp) return res.status(400).json({ error: 'La empleada vinculada no existe.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const r = await db.run(
      'INSERT INTO users (username, password_hash, full_name, role, email, approval_position, signature, employee_id) VALUES (?,?,?,?,?,?,?,?)',
      [username, hash, full_name, role, email || null, normPosition(approval_position), signature || null, empId]
    );
    // El admin ve todo, no necesita asignación de áreas
    if (role !== 'admin') await setUserDepartments(db, r.lastID, departments);

    res.status(201).json({ id: r.lastID, username, full_name, role });
  } catch (e) { next(e); }
});

// PUT /api/users/:id  → editar datos, rol, áreas y (opcional) contraseña
router.put('/:id', async (req, res, next) => {
  try {
    const { full_name, role, departments, is_active, password, email, approval_position, signature, employee_id } = req.body;
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${VALID_ROLES.join(', ')}` });
    }

    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const newRole = role || user.role;
    const newName = full_name ?? user.full_name;
    const newActive = is_active ?? user.is_active;
    const newEmail = email !== undefined ? (email || null) : user.email;
    const newPosition = approval_position !== undefined ? normPosition(approval_position) : user.approval_position;

    let newEmployeeId = user.employee_id;
    if (employee_id !== undefined) {
      newEmployeeId = normEmployeeId(employee_id);
      if (newEmployeeId) {
        const emp = await db.get('SELECT id FROM employees WHERE id = ? AND is_active = 1', newEmployeeId);
        if (!emp) return res.status(400).json({ error: 'La empleada vinculada no existe.' });
      }
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    }
    // La firma solo se toca si viene en la petición (undefined = no cambiar)
    if (signature !== undefined) {
      await db.run('UPDATE users SET signature = ? WHERE id = ?', [signature || null, user.id]);
    }

    await db.run(
      'UPDATE users SET full_name = ?, role = ?, is_active = ?, email = ?, approval_position = ?, employee_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newName, newRole, newActive, newEmail, newPosition, newEmployeeId, user.id]
    );

    if (newRole === 'admin') await db.run('DELETE FROM user_departments WHERE user_id = ?', user.id);
    else if (departments !== undefined) await setUserDepartments(db, user.id, departments);

    res.json({ success: true });
  } catch (e) { next(e); }
});

// DELETE /api/users/:id  → desactivar (no borra, conserva historial)
router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' });
    }
    await db.run('UPDATE users SET is_active = 0 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
