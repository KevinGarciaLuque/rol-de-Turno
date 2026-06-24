const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, userCanAccessDepartment } = require('../middleware/auth');

router.use(authenticate);

// Permite escribir solo a admin/supervisor/jefe que tengan acceso al área dada
async function ensureCanManage(req, res, db, departmentId) {
  if (req.user.role === 'lector') {
    res.status(403).json({ error: 'No tienes permiso para esta acción' });
    return false;
  }
  const ok = await userCanAccessDepartment(db, req.user, departmentId);
  if (!ok) {
    res.status(403).json({ error: 'No tienes acceso a esta área' });
    return false;
  }
  return true;
}

// Cuenta de acceso vinculada a la empleada (una sola, la activa o la más antigua).
// Se expone como resumen para precargar la sección "Acceso al sistema" de la ficha.
const ACCOUNT_FIELDS = `
  u.id AS account_user_id, u.username AS account_username, u.role AS account_role,
  u.is_active AS account_is_active, u.approval_position AS account_approval_position`;
const ACCOUNT_JOIN = `
  LEFT JOIN users u ON u.id = (
    SELECT id FROM users WHERE employee_id = e.id ORDER BY is_active DESC, id ASC LIMIT 1
  )`;

router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const { department_id, category } = req.query;
    let query = `SELECT e.*, d.name as department_name, ${ACCOUNT_FIELDS}
      FROM employees e
      JOIN departments d ON d.id=e.department_id
      ${ACCOUNT_JOIN}
      WHERE e.is_active=1`;
    const params = [];
    if (department_id) { query += ' AND e.department_id=?'; params.push(department_id); }
    if (category)      { query += ' AND e.category=?';      params.push(category); }
    query += ' ORDER BY e.role DESC, e.category, e.name';
    res.json(await db.all(query, params));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const row = await db.get(`SELECT e.*, d.name as department_name, ${ACCOUNT_FIELDS}
      FROM employees e
      JOIN departments d ON d.id=e.department_id
      ${ACCOUNT_JOIN}
      WHERE e.id=?`, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { department_id, clave, name, category, role, observations } = req.body;
    if (!department_id || !name || !category) return res.status(400).json({ error: 'department_id, name and category are required' });
    const db = await getDb();
    if (!(await ensureCanManage(req, res, db, department_id))) return;
    const r = await db.run(`INSERT INTO employees (department_id,clave,name,category,role,observations) VALUES (?,?,?,?,?,?)`,
      [department_id, clave, name, category, role || 'rotativa', observations]);
    res.status(201).json({ id: r.lastID, name });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { clave, name, category, role, observations, is_active } = req.body;
    const db = await getDb();
    const emp = await db.get('SELECT department_id FROM employees WHERE id=?', req.params.id);
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });
    if (!(await ensureCanManage(req, res, db, emp.department_id))) return;
    await db.run(`UPDATE employees SET clave=?,name=?,category=?,role=?,observations=?,is_active=? WHERE id=?`,
      [clave, name, category, role, observations, is_active ?? 1, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const emp = await db.get('SELECT department_id FROM employees WHERE id=?', req.params.id);
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });
    if (!(await ensureCanManage(req, res, db, emp.department_id))) return;
    await db.run(`UPDATE employees SET is_active=0 WHERE id=?`, req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
