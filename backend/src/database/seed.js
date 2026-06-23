const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

// Crea el usuario administrador inicial si todavía no existe ningún admin.
// Corre de forma independiente del seed de datos, para no quedarse nunca sin acceso.
async function seedUsers() {
  const db = await getDb();
  const admin = await db.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (admin) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);

  await db.run(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)`,
    [username, hash, 'Administrador', 'admin']
  );

  console.log(`\n⚠️  Usuario admin creado → usuario: "${username}"  contraseña: "${password}"`);
  console.log('   Cámbiala después del primer ingreso.\n');
}

// Defaults de turnos para instalaciones ya existentes (idempotente, no pisa lo editado).
async function seedShiftHours() {
  const db = await getDb();

  // Horario por defecto de A/B/C (COALESCE conserva lo que el admin haya puesto)
  const defaults = { A: ['07:00', '15:00'], B: ['15:00', '23:00'], C: ['23:00', '07:00'] };
  for (const [code, [s, e]] of Object.entries(defaults)) {
    await db.run(
      `UPDATE shift_types SET start_time = COALESCE(start_time, ?), end_time = COALESCE(end_time, ?) WHERE code = ?`,
      [s, e, code]
    );
  }

  // Día de la Enfermera (se agrega si aún no existe)
  await db.run(
    `INSERT IGNORE INTO shift_types (code,label,description,color,text_color,is_work_shift,sort_order) VALUES (?,?,?,?,?,?,?)`,
    ['DEN', 'Día Enf.', 'Día de la Enfermera', '#D81B60', '#FFFFFF', 0, 20]
  );
}

function parseShift(val) {
  if (val === '' || val === null || val === undefined) return 'L';
  const s = String(val).trim();
  if (s === '') return 'L';
  if (/^\d+$/.test(s)) return 'VAC';
  const map = {
    'FS¹':'FS1','FS1':'FS1','FS²':'FS2','FS2':'FS2',
    'F1¹':'F11','F1²':'F12',
    'F14¹':'F141','F14²':'F142',
    'FJ¹':'FJ1','FJ²':'FJ2',
    'FV¹':'FV1','FV²':'FV2',
    'DE':'DE','TC':'TC','L':'L','L ':'L',
    'A':'A','B':'B','C':'C',
    'INC':'INC','DP':'DP','VAC':'VAC',
  };
  return map[s] || s;
}

async function seed() {
  const db = await getDb();
  const existing = await db.get('SELECT COUNT(*) as count FROM hospitals');
  if (existing.count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database...');

  const shiftTypes = [
    { code:'A',    label:'Turno A',           description:'Turno de la mañana',            color:'#2E7D32', text_color:'#FFFFFF', is_work:1, sort:1  },
    { code:'B',    label:'Turno B',           description:'Turno de la tarde',             color:'#1565C0', text_color:'#FFFFFF', is_work:1, sort:2  },
    { code:'C',    label:'Turno C',           description:'Turno de la noche',             color:'#6A1B9A', text_color:'#FFFFFF', is_work:1, sort:3  },
    { code:'L',    label:'Libre',             description:'Día libre',                      color:'#757575', text_color:'#FFFFFF', is_work:0, sort:4  },
    { code:'DE',   label:'Desc. Extra',       description:'Descanso extra',                 color:'#E65100', text_color:'#FFFFFF', is_work:0, sort:5  },
    { code:'TC',   label:'T. Compensatorio',  description:'Turno compensatorio',            color:'#F57F17', text_color:'#000000', is_work:1, sort:6  },
    { code:'FS1',  label:'Fer. Sust. 1',      description:'Feriado Sustituido 1er pago',   color:'#00838F', text_color:'#FFFFFF', is_work:1, sort:7  },
    { code:'FS2',  label:'Fer. Sust. 2',      description:'Feriado Sustituido 2do pago',   color:'#00695C', text_color:'#FFFFFF', is_work:1, sort:8  },
    { code:'F11',  label:'Feriado 1 (1)',     description:'Feriado 1 - 1er pago',          color:'#AD1457', text_color:'#FFFFFF', is_work:1, sort:9  },
    { code:'F12',  label:'Feriado 1 (2)',     description:'Feriado 1 - 2do pago',          color:'#880E4F', text_color:'#FFFFFF', is_work:1, sort:10 },
    { code:'F141', label:'Feriado 14 (1)',    description:'Feriado 14 - 1er pago',         color:'#4527A0', text_color:'#FFFFFF', is_work:1, sort:11 },
    { code:'F142', label:'Feriado 14 (2)',    description:'Feriado 14 - 2do pago',         color:'#311B92', text_color:'#FFFFFF', is_work:1, sort:12 },
    { code:'FJ1',  label:'Fer. Judicial (1)', description:'Feriado Judicial 1er pago',     color:'#37474F', text_color:'#FFFFFF', is_work:1, sort:13 },
    { code:'FJ2',  label:'Fer. Judicial (2)', description:'Feriado Judicial 2do pago',     color:'#263238', text_color:'#FFFFFF', is_work:1, sort:14 },
    { code:'FV1',  label:'Fer. Vac. (1)',     description:'Feriado Vacacional 1er pago',   color:'#558B2F', text_color:'#FFFFFF', is_work:1, sort:15 },
    { code:'FV2',  label:'Fer. Vac. (2)',     description:'Feriado Vacacional 2do pago',   color:'#33691E', text_color:'#FFFFFF', is_work:1, sort:16 },
    { code:'VAC',  label:'Vacaciones',        description:'Día de vacaciones ordinarias',  color:'#0277BD', text_color:'#FFFFFF', is_work:0, sort:17 },
    { code:'DP',   label:'Desc. Profesional', description:'Descanso profesional',          color:'#4E342E', text_color:'#FFFFFF', is_work:0, sort:18 },
    { code:'INC',  label:'Incapacidad',       description:'Incapacidad médica',            color:'#B71C1C', text_color:'#FFFFFF', is_work:0, sort:19 },
    { code:'DEN',  label:'Día Enf.',          description:'Día de la Enfermera',           color:'#D81B60', text_color:'#FFFFFF', is_work:0, sort:20 },
  ];

  for (const st of shiftTypes) {
    await db.run(`INSERT IGNORE INTO shift_types (code,label,description,color,text_color,is_work_shift,sort_order) VALUES (?,?,?,?,?,?,?)`,
      [st.code, st.label, st.description, st.color, st.text_color, st.is_work, st.sort]);
  }

  // Hospital
  const { lastID: hospitalId } = await db.run(`INSERT INTO hospitals (name, short_name) VALUES (?, ?)`, ['Hospital María Especialidades Pediátricas', 'HMEP']);

  // Departments
  const { lastID: nefroId } = await db.run(`INSERT INTO departments (hospital_id,name,short_name,supervisor,area_chief) VALUES (?,?,?,?,?)`,
    [hospitalId, 'Nefrología', 'NEFRO', 'Msc. Irene Garcia', 'Msc. Yeny Mendez']);
  const { lastID: hdId } = await db.run(`INSERT INTO departments (hospital_id,name,short_name,supervisor,area_chief) VALUES (?,?,?,?,?)`,
    [hospitalId, 'Hemodiálisis', 'HD', 'Msc. Vanessa Reyes', 'Msc. Yeny Mendez']);

  async function addEmp(deptId, clave, name, category, role, obs) {
    const r = await db.run(`INSERT INTO employees (department_id,clave,name,category,role,observations) VALUES (?,?,?,?,?,?)`,
      [deptId, clave, name, category, role || 'rotativa', obs || null]);
    return r.lastID;
  }

  // Licenciadas Nefrología
  const e1  = await addEmp(nefroId, 'SESAL',  'Garcia Martinez Irene Mabel',       'licenciada',    'jefe_sala',     null);
  const e2  = await addEmp(nefroId, '100114', 'Briceño Duron Orfa Eunice',          'licenciada',    'rotativa',      'Des. Prof 15/06/2026 al 16/07/2026');
  const e3  = await addEmp(nefroId, '100115', 'Ramos Norales Diana',                'licenciada',    'rotativa',      null);
  const e4  = await addEmp(nefroId, '100113', 'Vilchez Betanco Angela Lucila',      'licenciada',    'rotativa',      'Desc. Prof 22/06/2026 al 23/07/2026');
  const e5  = await addEmp(nefroId, '100475', 'Mejia Nuñez Michell Andrea',         'licenciada',    'rotativa',      'INCAPACIDAD 21/5/26 AL 19/6/26 (30D)');
  const e6  = await addEmp(nefroId, '100455', 'Hernandez Gomez Norma Regina',       'licenciada',    'rotativa',      'Desc. Prof 18/05/26 al 18/06/26');
  const e7  = await addEmp(nefroId, '100390', 'Servantez Maradiaga Katery',         'licenciada',    'rotativa',      null);
  const e8  = await addEmp(nefroId, '100116', 'Escoto Hernandez Fany Gisela',       'licenciada',    'rotativa',      'Des. Prof 04/05/26 al 04/06/26');
  const e9  = await addEmp(nefroId, '100432', 'Sosa Zepeda Johana Dulenia',         'licenciada',    'rotativa',      null);
  const e10 = await addEmp(nefroId, 'CEUTEC', 'Bonilla Ferrera Paola Elizabeth',    'servicio_social','servicio_social','SS Hasta el 10/06/2026');

  // Auxiliares Nefrología
  const a1  = await addEmp(nefroId, 'SESAL',  'Gonzales Peña Ana Gabriela',         'auxiliar',      'rotativa',      null);
  const a2  = await addEmp(nefroId, '100126', 'Montez Salgado Alicia Alejandra',    'auxiliar',      'rotativa',      null);
  const a3  = await addEmp(nefroId, '100121', 'Ordoñez Barahona Any Cristel',       'auxiliar',      'rotativa',      null);
  const a4  = await addEmp(nefroId, '100459', 'Chacon Torres Ana Yolanda',          'auxiliar',      'rotativa',      'Desc. Prof 25/05/26 al 23/06/26');
  const a5  = await addEmp(nefroId, '100247', 'Martinez Hernandez Jairo Danilo',    'auxiliar',      'rotativa',      'Des. Prof 18/05/26 al 16/06/2026');
  const a6  = await addEmp(nefroId, '100247', 'Ortiz Mendoza Vilma Suyapa',         'auxiliar',      'rotativa',      null);
  const a7  = await addEmp(nefroId, '100502', 'Rodriguez Betanco Jeinny Melissa',   'auxiliar',      'rotativa',      null);
  const a8  = await addEmp(nefroId, '100278', 'Dubon Matute Ramona Beatriz',        'auxiliar',      'rotativa',      'Vac. Ord 15/06/2026 al 10/07/2026');
  const a9  = await addEmp(nefroId, '100228', 'Bonilla Fonseca Walter Alexander',   'auxiliar',      'rotativa',      'DP. 15/06/2026 al 14/07/2026');
  const a10 = await addEmp(nefroId, '100137', 'Meza Guevara Olga Suyapa',           'auxiliar',      'rotativa',      null);
  const a11 = await addEmp(nefroId, '100224', 'Flores Flores Jenni Sarahi',         'auxiliar',      'rotativa',      'Des. P 11/05/26 al 09/06/26');
  const a12 = await addEmp(nefroId, '100460', 'Ramos Yenny Yamileth',               'auxiliar',      'rotativa',      'Des. Prof 22/06/2026 al 21/07/2026');
  const a13 = await addEmp(nefroId, '100154', 'Barahona Mendoza Maber Joel',        'auxiliar',      'rotativa',      null);
  const a14 = await addEmp(nefroId, '100538', 'Alcantara Martinez Steven Josemaria','auxiliar',      'rotativa',      null);
  const a15 = await addEmp(nefroId, 'EM',     'Zuniga Varela Lizzy Aylin',          'servicio_social','servicio_social',null);
  const a16 = await addEmp(nefroId, 'EM',     'Silva Aguilar Seidy Maricruz',       'servicio_social','servicio_social',null);
  const a17 = await addEmp(nefroId, 'CAE',    'Pino Melany Fernanda',               'servicio_social','servicio_social',null);
  const a18 = await addEmp(nefroId, 'EM',     'Sosa Gloria Edith',                  'servicio_social','servicio_social',null);

  // Hemodialisis
  const h1  = await addEmp(hdId, '100135', 'Reyes Rivera Sandra Vanessa',           'hd_profesional', 'jefe_sala',    null);
  const h2  = await addEmp(hdId, '100281', 'Cruz Cruz Nancy Maricela',              'hd_profesional', 'rotativa',     'F1² (Feriado de Nefrología)');
  const h3  = await addEmp(hdId, '100422', 'Guzman Pereira Sara Isabel',            'hd_auxiliar',    'rotativa',     'F1² (Feriados de Nefrología)');
  const h4  = await addEmp(hdId, '100131', 'Romero Aguilera Mirian Yamileth',       'hd_auxiliar',    'rotativa',     'F1¹ F1² (Feriados de Nefrología)');
  const h5  = await addEmp(hdId, 'SESAL',  'Barahona Betancourth Andrea Gisela',    'hd_auxiliar',    'rotativa',     'Inducción 2do mes');

  // Schedule months
  const { lastID: schedNefro } = await db.run(`INSERT INTO schedule_months (department_id,year,month,status) VALUES (?,?,?,?)`, [nefroId, 2026, 6, 'published']);
  const { lastID: schedHD }    = await db.run(`INSERT INTO schedule_months (department_id,year,month,status) VALUES (?,?,?,?)`, [hdId, 2026, 6, 'published']);

  async function insertShifts(schedId, empId, shifts) {
    for (let i = 0; i < shifts.length; i++) {
      const code = parseShift(shifts[i]);
      if (code && code !== '') {
        await db.run(`INSERT IGNORE INTO schedule_entries (schedule_month_id,employee_id,day,shift_code) VALUES (?,?,?,?)`,
          [schedId, empId, i + 1, code]);
      }
    }
  }

  // Licenciadas
  await insertShifts(schedNefro, e1,  ['A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A']);
  await insertShifts(schedNefro, e2,  ['L','A','A','B','L','A','C','L','B','B','B','C','L','L',1,2,3,4,5,'L','L',6,7,8,9,10,'L','L',11,12]);
  await insertShifts(schedNefro, e3,  ['A','C','L','A','C','L','A','B','B','C','L','B','L','L','A','L','A','A','B','B','L','B','L','A','A','B','C','C','L','L']);
  await insertShifts(schedNefro, e4,  ['B','B','L','L','A','A','B','B','L','A','A','B','B','L','B','L','A','C','C','L','L',1,2,3,4,5,'L','L',6,7]);
  await insertShifts(schedNefro, e5,  ['A','A','C','L','A','B','L','A','A','L','C','L','A','B','B','B','B','L','A','L','L','A','B','B','C','C','L','L','C','L']);
  await insertShifts(schedNefro, e6,  [11,12,13,14,15,'L','L',16,17,18,19,20,'L','L',21,22,23,24,'A','A','A','L','C','L','A','L','A','B','L','B']);
  await insertShifts(schedNefro, e7,  ['C','L','B','C','L','L','L','A','A','B','L','A','DE','C','L','A','C','L','L','A','B','C','L','B','B','L','A','A','A','A']);
  await insertShifts(schedNefro, e8,  [21,22,23,24,'FS²','F14¹','DE','L','L','F14²','B','L','A','A','C','L','B','B','L','C','C','L','L','C','L','A','B','L','B','C']);
  await insertShifts(schedNefro, e9,  ['L','L','A','A','B','C','L','C','C','L','A','L','C','L','A','C','L','A','B','L','A','F1¹','A','A','F1²','B','L','L','B','B']);
  await insertShifts(schedNefro, e10, ['A','A','A','A','A','L','L','A','A','A','','','','','','','','','','','','','','','','','','','','']);

  // Auxiliares
  await insertShifts(schedNefro, a1,  ['F11','C','L','A','A','L','L','A','C','C','L','L','B','B','C','L','B','B','L','A','A','B','B','L','L','C','L','A','B','B']);
  await insertShifts(schedNefro, a2,  ['A','A','C','L','B','B','L','A','A','B','L','A','A','A','L','C','L','A','L','B','L','C','L','F11','B','B','L','L','C','C']);
  await insertShifts(schedNefro, a3,  ['A','B','L','C','L','A','C','L','B','B','C','L','L','L','A','A','C','L','A','A','L','B','C','L','A','A','B','B','L','A']);
  await insertShifts(schedNefro, a4,  [6,7,8,9,10,'L','L',11,12,13,14,15,'L','L',16,17,18,19,20,'L','L',21,22,'A','A','B','C','C','L','L']);
  await insertShifts(schedNefro, a5,  [11,12,13,14,15,'L','L',16,17,18,19,20,'L','L',21,22,'C','L','FV²','A','C','L','F11','L','A','L','A','A','L','C']);
  await insertShifts(schedNefro, a6,  ['L','L','A','B','C','L','A','C','L','TC','B','B','B','FS²','B','C','L','C','L','L','L','A','A','C','L','A','B','B','L','A']);
  await insertShifts(schedNefro, a7,  ['B','C','L','A','FS¹','C','C','L','L','A','A','FS²','L','L','A','A','A','L','A','L','B','L','B','B','C','L','C','L','A','B']);
  await insertShifts(schedNefro, a8,  ['L','A','C','L','A','B','B','L','A','A','F12','C','L','L',1,2,3,4,5,'L','L',6,7,8,9,10,'L','L',11,12]);
  await insertShifts(schedNefro, a9,  ['C','L','B','C','L','A','A','L','B','C','L','C','L','FJ²',1,2,3,4,5,'L','L',6,7,8,9,10,'L','L',11,12]);
  await insertShifts(schedNefro, a10, ['A','A','B','L','C','L','B','B','C','L','A','B','L','B','C','L','L','A','B','C','C','L','L','A','B','F142','L','L','A','A']);
  await insertShifts(schedNefro, a11, [16,17,18,19,20,'L','L',21,22,'FV²','L','A','C','C','L','L','A','B','B','L','A','C','L','B','C','C','L','L','B','B']);
  await insertShifts(schedNefro, a12, ['C','L','A','B','B','C','L','B','L','B','C','L','A','A','B','B','L','C','C','L','L',1,2,3,4,5,'L','L',6,7]);
  await insertShifts(schedNefro, a13, ['B','B','F141','A','A','L','L','C','L','A','B','L','C','C','L','L','A','A','L','B','B','A','C','L','B','F142','A','C','L','L']);
  await insertShifts(schedNefro, a14, ['A','A','A','A','L','A','L','A','A','A','A','L','A','L','A','B','B','DE','C','C','L','L','A','C','L','B','L','L','C','L']);
  await insertShifts(schedNefro, a15, ['A','A','C','L','A','L','L','B','B','C','L','A','A','A','L','A','B','B','L','B','B','L','A','A','A','A','L','L','C','L']);
  await insertShifts(schedNefro, a16, ['L','L','A','A','B','L','A','C','L','A','A','B','B','L','B','B','C','L','A','A','A','A','L','B','C','L','L','L','A','A']);
  await insertShifts(schedNefro, a17, ['B','B','B','B','L','C','L','A','A','A','B','C','L','L','C','L','A','A','B','L','L','C','L','A','L','A','A','A','A','L']);
  await insertShifts(schedNefro, a18, ['A','A','A','A','L','A','L','A','A','A','A','A','L','L','A','A','A','A','A','L','L','B','B','L','L','L','B','B','B','L']);

  // Hemodialisis
  await insertShifts(schedHD, h1, ['DE','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A']);
  await insertShifts(schedHD, h2, ['A','A','A','A','L','A','L','A','A','A','A','A','L','L','A','A','A','DE','A','L','L','A','A','A','A','A','L','L','A','A']);
  await insertShifts(schedHD, h3, ['A','A','A','L','A','L','L','A','A','DE','A','A','A','L','A','A','A','A','A','L','L','A','A','L','A','A','A','L','A','A']);
  await insertShifts(schedHD, h4, ['L','DE','A','A','A','A','L','A','A','A','A','A','L','L','A','A','L','A','A','A','L','A','A','A','A','A','L','L','A','A']);
  await insertShifts(schedHD, h5, ['A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A','A','A','A','L','L','A','A','A','L','A','A','L','A','A']);

  console.log('Database seeded successfully!');
}

module.exports = { seed, seedUsers, seedShiftHours };
