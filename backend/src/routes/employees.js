const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const { department_id, category } = req.query;
    let query = `SELECT e.*, d.name as department_name FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.is_active=1`;
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
    const row = await db.get(`SELECT e.*, d.name as department_name FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.id=?`, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { department_id, clave, name, category, role, observations } = req.body;
    if (!department_id || !name || !category) return res.status(400).json({ error: 'department_id, name and category are required' });
    const db = await getDb();
    const r = await db.run(`INSERT INTO employees (department_id,clave,name,category,role,observations) VALUES (?,?,?,?,?,?)`,
      [department_id, clave, name, category, role || 'rotativa', observations]);
    res.status(201).json({ id: r.lastID, name });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { clave, name, category, role, observations, is_active } = req.body;
    const db = await getDb();
    await db.run(`UPDATE employees SET clave=?,name=?,category=?,role=?,observations=?,is_active=? WHERE id=?`,
      [clave, name, category, role, observations, is_active ?? 1, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    await db.run(`UPDATE employees SET is_active=0 WHERE id=?`, req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
