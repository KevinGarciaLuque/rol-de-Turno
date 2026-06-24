const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Empleada vinculada a la cuenta en sesión (o null)
async function getMyEmployee(db, userId) {
  const u = await db.get('SELECT employee_id FROM users WHERE id = ?', userId);
  if (!u?.employee_id) return null;
  return db.get(
    `SELECT e.id, e.name, e.clave, e.category, e.role, e.department_id, d.name AS department_name
     FROM employees e JOIN departments d ON d.id = e.department_id
     WHERE e.id = ? AND e.is_active = 1`,
    u.employee_id
  );
}

// GET /api/me  → datos de la empleada vinculada (para encabezado de "Mi Horario")
router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const employee = await getMyEmployee(db, req.user.id);
    if (!employee) return res.status(404).json({ error: 'Tu cuenta no está vinculada a una empleada.' });
    res.json({ employee });
  } catch (e) { next(e); }
});

// GET /api/me/schedule/:year/:month
// Devuelve SOLO los turnos de la empleada en sesión y SOLO si el rol del mes está aprobado.
router.get('/schedule/:year/:month', async (req, res, next) => {
  try {
    const db = await getDb();
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Año o mes inválido.' });
    }

    const employee = await getMyEmployee(db, req.user.id);
    if (!employee) return res.status(404).json({ error: 'Tu cuenta no está vinculada a una empleada.' });

    const sm = await db.get(
      'SELECT * FROM schedule_months WHERE department_id=? AND year=? AND month=?',
      [employee.department_id, year, month]
    );

    const base = { employee, year, month, published: false, days: {}, totals: {}, nextShift: null };

    // Solo se muestra cuando el rol ya pasó por todas las firmas (aprobado).
    if (!sm || sm.approval_state !== 'approved') {
      return res.json(base);
    }

    const entries = await db.all(
      'SELECT day, shift_code FROM schedule_entries WHERE schedule_month_id=? AND employee_id=?',
      [sm.id, employee.id]
    );

    const days = {};
    const totals = {};
    for (const e of entries) {
      days[e.day] = e.shift_code;
      totals[e.shift_code] = (totals[e.shift_code] || 0) + 1;
    }

    // Próximo turno de trabajo a partir de hoy (si el mes consultado es el actual o futuro)
    const today = new Date();
    let nextShift = null;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      date.setHours(0, 0, 0, 0);
      const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
      if (date < t0) continue;
      const code = days[d];
      if (code && code !== 'L') { nextShift = { day: d, shift_code: code, date: date.toISOString() }; break; }
    }

    res.json({ ...base, published: true, scheduleMonthId: sm.id, days, totals, nextShift });
  } catch (e) { next(e); }
});

module.exports = router;
