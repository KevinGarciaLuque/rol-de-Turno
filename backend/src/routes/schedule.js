const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, userCanAccessDepartment } = require('../middleware/auth');

router.use(authenticate);

async function ensureCanEdit(req, res, db, departmentId) {
  if (req.user.role === 'lector') {
    res.status(403).json({ error: 'No tienes permiso para editar el horario' });
    return false;
  }
  const ok = await userCanAccessDepartment(db, req.user, departmentId);
  if (!ok) {
    res.status(403).json({ error: 'No tienes acceso a esta área' });
    return false;
  }
  return true;
}

async function getOrCreateScheduleMonth(db, departmentId, year, month) {
  let sm = await db.get(`SELECT * FROM schedule_months WHERE department_id=? AND year=? AND month=?`, [departmentId, year, month]);
  if (!sm) {
    const r = await db.run(`INSERT INTO schedule_months (department_id,year,month,status) VALUES (?,?,?,'draft')`, [departmentId, year, month]);
    sm = await db.get(`SELECT * FROM schedule_months WHERE id=?`, r.lastID);
  }
  return sm;
}

// GET /api/schedule/shift-types/all
router.get('/shift-types/all', async (req, res, next) => {
  try {
    const db = await getDb();
    res.json(await db.all(`SELECT * FROM shift_types ORDER BY sort_order`));
  } catch (e) { next(e); }
});

// GET /api/schedule/summary/:departmentId
router.get('/summary/:departmentId', async (req, res, next) => {
  try {
    const db = await getDb();
    res.json(await db.all(`SELECT * FROM schedule_months WHERE department_id=? ORDER BY year DESC, month DESC LIMIT 12`, req.params.departmentId));
  } catch (e) { next(e); }
});

// GET /api/schedule/:departmentId/:year/:month
router.get('/:departmentId/:year/:month', async (req, res, next) => {
  try {
    const { departmentId, year, month } = req.params;
    const db = await getDb();

    const sm = await db.get(`SELECT * FROM schedule_months WHERE department_id=? AND year=? AND month=?`, [departmentId, year, month]);
    if (!sm) return res.json({ scheduleMonth: null, employees: [], matrix: {}, dailyCounts: {}, employeeTotals: {} });

    const employees = await db.all(`SELECT * FROM employees WHERE department_id=? AND is_active=1 ORDER BY role DESC, category, name`, departmentId);
    const entries = await db.all(`SELECT * FROM schedule_entries WHERE schedule_month_id=?`, sm.id);

    const matrix = {};
    entries.forEach(e => {
      if (!matrix[e.employee_id]) matrix[e.employee_id] = {};
      matrix[e.employee_id][e.day] = e.shift_code;
    });

    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const dailyCounts = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyCounts[d] = { A: 0, B: 0, C: 0, L: 0, other: 0 };
      employees.forEach(emp => {
        const code = matrix[emp.id]?.[d] || 'L';
        if (['A','B','C','L'].includes(code)) dailyCounts[d][code]++;
        else dailyCounts[d].other++;
      });
    }

    const workCodes = ['A','B','C','TC','FS1','FS2','F11','F12','F141','F142','FJ1','FJ2','FV1','FV2'];
    const employeeTotals = {};
    employees.forEach(emp => {
      const t = { A:0, B:0, C:0, L:0, DE:0, VAC:0, special:0 };
      for (let d = 1; d <= daysInMonth; d++) {
        const code = matrix[emp.id]?.[d] || 'L';
        if (t[code] !== undefined) t[code]++;
        else if (workCodes.includes(code)) t.special++;
        else if (code === 'VAC') t.VAC++;
      }
      employeeTotals[emp.id] = t;
    });

    res.json({ scheduleMonth: sm, employees, matrix, dailyCounts, employeeTotals });
  } catch (e) { next(e); }
});

// PUT /api/schedule/entry
router.put('/entry', async (req, res, next) => {
  try {
    const { department_id, year, month, employee_id, day, shift_code } = req.body;
    if (!department_id || !year || !month || !employee_id || !day || !shift_code) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const db = await getDb();
    if (!(await ensureCanEdit(req, res, db, department_id))) return;
    const sm = await getOrCreateScheduleMonth(db, department_id, year, month);
    await db.run(`
      INSERT INTO schedule_entries (schedule_month_id,employee_id,day,shift_code) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE shift_code=VALUES(shift_code), updated_at=CURRENT_TIMESTAMP
    `, [sm.id, employee_id, day, shift_code]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// PUT /api/schedule/:scheduleMonthId/status
router.put('/:scheduleMonthId/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['draft','published','closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const db = await getDb();
    const sm = await db.get('SELECT department_id FROM schedule_months WHERE id=?', req.params.scheduleMonthId);
    if (!sm) return res.status(404).json({ error: 'Programación no encontrada' });
    if (!(await ensureCanEdit(req, res, db, sm.department_id))) return;
    await db.run(`UPDATE schedule_months SET status=? WHERE id=?`, [status, req.params.scheduleMonthId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
