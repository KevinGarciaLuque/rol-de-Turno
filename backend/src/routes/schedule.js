const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, userCanAccessDepartment } = require('../middleware/auth');
const { CHAIN, MAX_LEVEL, stepByLevel, labelForLevel } = require('../config/approval');
const { notifyUsers } = require('../utils/notify');

router.use(authenticate);

/* ------------------------- Helpers de aprobación ------------------------- */

// Usuarios que ocupan un nivel para un área (niveles 1-2 por área; 3-5 globales)
async function approversForLevel(db, level, departmentId) {
  const step = stepByLevel(level);
  if (!step) return [];
  if (step.scope === 'department') {
    return db.all(
      `SELECT u.id, u.full_name, u.email FROM users u
       JOIN user_departments ud ON ud.user_id = u.id
       WHERE u.approval_position = ? AND ud.department_id = ? AND u.is_active = 1`,
      [step.position, departmentId]
    );
  }
  return db.all(`SELECT id, full_name, email FROM users WHERE approval_position = ? AND is_active = 1`, step.position);
}

// ¿El usuario es quien debe firmar AHORA este rol?
async function isCurrentApprover(db, me, sm) {
  if (!me?.approval_position) return false;
  const step = stepByLevel(sm.current_level);
  if (!step || step.position !== me.approval_position) return false;
  if (step.scope === 'department') {
    const row = await db.get('SELECT 1 FROM user_departments WHERE user_id=? AND department_id=?', [me.id, sm.department_id]);
    return !!row;
  }
  return true;
}

// ¿Puede editar los turnos en este momento?
async function canEditNow(db, user, departmentId, sm) {
  if (user.role === 'lector') return false;
  if (sm && sm.approval_state === 'approved') return false; // bloqueado tras aprobación
  if (user.role === 'admin') return true;
  if (await userCanAccessDepartment(db, user, departmentId)) return true; // jefe/supervisor del área
  if (sm) {
    const me = await db.get('SELECT approval_position FROM users WHERE id=?', user.id);
    const step = stepByLevel(sm.current_level);
    if (me?.approval_position && step && step.position === me.approval_position) return true; // aprobador global en su turno
  }
  return false;
}

async function scheduleLabel(db, sm) {
  const dept = await db.get('SELECT name FROM departments WHERE id=?', sm.department_id);
  return `${dept?.name || 'Área'} — ${String(sm.month).padStart(2, '0')}/${sm.year}`;
}

async function getOrCreateScheduleMonth(db, departmentId, year, month) {
  let sm = await db.get(`SELECT * FROM schedule_months WHERE department_id=? AND year=? AND month=?`, [departmentId, year, month]);
  if (!sm) {
    const r = await db.run(`INSERT INTO schedule_months (department_id,year,month,status) VALUES (?,?,?,'draft')`, [departmentId, year, month]);
    sm = await db.get(`SELECT * FROM schedule_months WHERE id=?`, r.lastID);
  }
  return sm;
}

/* ------------------------------- Lectura ------------------------------- */

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

    // Las empleadas del área se muestran SIEMPRE (existan o no turnos para ese mes).
    const employees = await db.all(`SELECT * FROM employees WHERE department_id=? AND is_active=1 ORDER BY role DESC, category, name`, departmentId);
    const entries = sm ? await db.all(`SELECT * FROM schedule_entries WHERE schedule_month_id=?`, sm.id) : [];

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

    // Información del flujo de aprobación (solo si el mes existe)
    let approval = null;
    if (sm) {
      const me = await db.get('SELECT id, approval_position FROM users WHERE id=?', req.user.id);
      const canAct = sm.approval_state !== 'approved' && await isCurrentApprover(db, me, sm);
      const timeline = await db.all('SELECT * FROM schedule_approvals WHERE schedule_month_id=? ORDER BY created_at ASC, id ASC', sm.id);
      approval = {
        state: sm.approval_state,
        current_level: sm.current_level,
        current_label: labelForLevel(sm.current_level),
        chain: CHAIN.map(c => ({ level: c.level, label: c.label })),
        can_sign: canAct,
        can_reject: canAct && sm.current_level > 1,
        timeline,
      };
    }

    res.json({ scheduleMonth: sm, employees, matrix, dailyCounts, employeeTotals, approval });
  } catch (e) { next(e); }
});

// GET /api/schedule/:scheduleMonthId/timeline
router.get('/:scheduleMonthId/timeline', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM schedule_approvals WHERE schedule_month_id=? ORDER BY created_at ASC, id ASC', req.params.scheduleMonthId);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/schedule/:scheduleMonthId/signatures  → firmas (imagen) de quienes ya firmaron, la más reciente por nivel
router.get('/:scheduleMonthId/signatures', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(
      `SELECT a.level, a.position, a.user_name, a.created_at, u.signature
       FROM schedule_approvals a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.schedule_month_id = ? AND a.action = 'sign'
       ORDER BY a.level ASC, a.created_at ASC`,
      req.params.scheduleMonthId
    );
    const byPos = {};
    for (const r of rows) byPos[r.position] = r; // la última firma de cada nivel gana
    res.json(Object.values(byPos));
  } catch (e) { next(e); }
});

/* ------------------------------- Edición ------------------------------- */

// PUT /api/schedule/entry
router.put('/entry', async (req, res, next) => {
  try {
    const { department_id, year, month, employee_id, day, shift_code } = req.body;
    if (!department_id || !year || !month || !employee_id || !day || !shift_code) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const db = await getDb();
    const existing = await db.get('SELECT * FROM schedule_months WHERE department_id=? AND year=? AND month=?', [department_id, year, month]);
    if (existing && existing.approval_state === 'approved') {
      return res.status(423).json({ error: 'El rol está aprobado y bloqueado. Un administrador debe reabrirlo para editar.' });
    }
    if (!(await canEditNow(db, req.user, department_id, existing))) {
      return res.status(403).json({ error: 'No tienes permiso para editar este rol en este momento.' });
    }
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
    const sm = await db.get('SELECT * FROM schedule_months WHERE id=?', req.params.scheduleMonthId);
    if (!sm) return res.status(404).json({ error: 'Programación no encontrada' });
    if (!(await canEditNow(db, req.user, sm.department_id, sm))) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    await db.run(`UPDATE schedule_months SET status=? WHERE id=?`, [status, req.params.scheduleMonthId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

/* --------------------------- Flujo de firmas --------------------------- */

// POST /api/schedule/:scheduleMonthId/sign  → firma del nivel actual (avanza)
router.post('/:scheduleMonthId/sign', async (req, res, next) => {
  try {
    const db = await getDb();
    const sm = await db.get('SELECT * FROM schedule_months WHERE id=?', req.params.scheduleMonthId);
    if (!sm) return res.status(404).json({ error: 'Programación no encontrada' });
    if (sm.approval_state === 'approved') return res.status(400).json({ error: 'El rol ya está aprobado.' });

    const me = await db.get('SELECT * FROM users WHERE id=?', req.user.id);
    if (!(await isCurrentApprover(db, me, sm))) {
      return res.status(403).json({ error: 'No te corresponde firmar este rol en este momento.' });
    }

    const level = sm.current_level;
    const step = stepByLevel(level);
    await db.run(
      'INSERT INTO schedule_approvals (schedule_month_id, level, position, user_id, user_name, action) VALUES (?,?,?,?,?,?)',
      [sm.id, level, step.position, me.id, me.full_name, 'sign']
    );

    const label = await scheduleLabel(db, sm);

    if (level < MAX_LEVEL) {
      const next = level + 1;
      await db.run('UPDATE schedule_months SET current_level=?, approval_state=? WHERE id=?', [next, 'in_review', sm.id]);
      const approvers = await approversForLevel(db, next, sm.department_id);
      await notifyUsers(db, approvers, {
        scheduleMonthId: sm.id, type: 'pending_sign', title: 'Rol pendiente de tu firma',
        body: `${me.full_name} firmó el rol "${label}". Te toca revisarlo y firmarlo como ${labelForLevel(next)}.`,
      });
      return res.json({ success: true, approval_state: 'in_review', current_level: next });
    }

    // Firma final → aprobado y bloqueado
    await db.run('UPDATE schedule_months SET approval_state=?, status=? WHERE id=?', ['approved', 'published', sm.id]);
    const owners = await approversForLevel(db, 1, sm.department_id);
    await notifyUsers(db, owners, {
      scheduleMonthId: sm.id, type: 'approved', title: 'Rol aprobado ✅',
      body: `El rol "${label}" fue aprobado por ${me.full_name} (${labelForLevel(level)}). Queda bloqueado.`,
    });
    res.json({ success: true, approval_state: 'approved' });
  } catch (e) { next(e); }
});

// POST /api/schedule/:scheduleMonthId/reject  { target_level, note }
router.post('/:scheduleMonthId/reject', async (req, res, next) => {
  try {
    const { target_level, note } = req.body;
    const db = await getDb();
    const sm = await db.get('SELECT * FROM schedule_months WHERE id=?', req.params.scheduleMonthId);
    if (!sm) return res.status(404).json({ error: 'Programación no encontrada' });
    if (sm.approval_state === 'approved') return res.status(400).json({ error: 'El rol ya está aprobado.' });

    const me = await db.get('SELECT * FROM users WHERE id=?', req.user.id);
    if (!(await isCurrentApprover(db, me, sm))) {
      return res.status(403).json({ error: 'No te corresponde rechazar este rol en este momento.' });
    }

    const target = Number(target_level);
    if (!Number.isInteger(target) || target < 1 || target >= sm.current_level) {
      return res.status(400).json({ error: 'Selecciona un nivel válido (anterior al actual) al cual devolver.' });
    }
    if (!note || !String(note).trim()) {
      return res.status(400).json({ error: 'Agrega una nota explicando el motivo del rechazo.' });
    }

    const step = stepByLevel(sm.current_level);
    await db.run(
      'INSERT INTO schedule_approvals (schedule_month_id, level, position, user_id, user_name, action, target_level, note) VALUES (?,?,?,?,?,?,?,?)',
      [sm.id, sm.current_level, step.position, me.id, me.full_name, 'reject', target, String(note).trim()]
    );
    await db.run('UPDATE schedule_months SET current_level=?, approval_state=? WHERE id=?', [target, 'in_review', sm.id]);

    const label = await scheduleLabel(db, sm);
    const approvers = await approversForLevel(db, target, sm.department_id);
    await notifyUsers(db, approvers, {
      scheduleMonthId: sm.id, type: 'rejected', title: 'Rol devuelto para revisión ✋',
      body: `${me.full_name} (${labelForLevel(sm.current_level)}) devolvió el rol "${label}" a ${labelForLevel(target)}.\nMotivo: ${String(note).trim()}`,
    });
    res.json({ success: true, returned_to: target });
  } catch (e) { next(e); }
});

// POST /api/schedule/:scheduleMonthId/reopen  → reabrir un rol aprobado (solo admin)
router.post('/:scheduleMonthId/reopen', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede reabrir un rol.' });
    const db = await getDb();
    const sm = await db.get('SELECT * FROM schedule_months WHERE id=?', req.params.scheduleMonthId);
    if (!sm) return res.status(404).json({ error: 'Programación no encontrada' });
    await db.run('UPDATE schedule_months SET approval_state=?, current_level=1, status=? WHERE id=?', ['draft', 'draft', sm.id]);
    await db.run(
      'INSERT INTO schedule_approvals (schedule_month_id, level, position, user_id, user_name, action, note) VALUES (?,?,?,?,?,?,?)',
      [sm.id, 0, 'admin', req.user.id, req.user.full_name, 'reopen', 'Rol reabierto para edición']
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
