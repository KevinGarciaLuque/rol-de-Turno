const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(`SELECT d.*, h.name as hospital_name, h.short_name as hospital_short FROM departments d JOIN hospitals h ON h.id = d.hospital_id ORDER BY d.id`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const row = await db.get(`SELECT d.*, h.name as hospital_name FROM departments d JOIN hospitals h ON h.id=d.hospital_id WHERE d.id=?`, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { hospital_id, name, short_name, supervisor, area_chief } = req.body;
    if (!hospital_id || !name) return res.status(400).json({ error: 'hospital_id and name are required' });
    const db = await getDb();
    const r = await db.run(`INSERT INTO departments (hospital_id,name,short_name,supervisor,area_chief) VALUES (?,?,?,?,?)`, [hospital_id, name, short_name, supervisor, area_chief]);
    res.status(201).json({ id: r.lastID, name });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, short_name, supervisor, area_chief } = req.body;
    const db = await getDb();
    await db.run(`UPDATE departments SET name=?,short_name=?,supervisor=?,area_chief=? WHERE id=?`, [name, short_name, supervisor, area_chief, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
