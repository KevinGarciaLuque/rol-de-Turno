require('dotenv').config();
const mysql = require('mysql2/promise');

// Resuelve la configuración de conexión:
// - En Railway/producción: una sola URL (DATABASE_URL o MYSQL_URL)
// - En local: variables sueltas del .env (DB_HOST, DB_USER, ...)
function resolveConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'rol_turno',
    };
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rol_turno',
  };
}

const { database: DB_NAME, ...CFG } = resolveConfig();

let _pool = null;
let _db = null;

// Esquema en MySQL (orden importa por las llaves foráneas)
const TABLES = [
  `CREATE TABLE IF NOT EXISTS hospitals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    supervisor VARCHAR(255),
    area_chief VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
  )`,

  `CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department_id INT NOT NULL,
    clave VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    role VARCHAR(50) DEFAULT 'rotativa',
    is_active TINYINT DEFAULT 1,
    observations TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  )`,

  `CREATE TABLE IF NOT EXISTS schedule_months (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department_id INT NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sched (department_id, year, month),
    FOREIGN KEY (department_id) REFERENCES departments(id)
  )`,

  `CREATE TABLE IF NOT EXISTS schedule_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_month_id INT NOT NULL,
    employee_id INT NOT NULL,
    day INT NOT NULL,
    shift_code VARCHAR(10) NOT NULL DEFAULT 'L',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_entry (schedule_month_id, employee_id, day),
    FOREIGN KEY (schedule_month_id) REFERENCES schedule_months(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )`,

  `CREATE TABLE IF NOT EXISTS shift_types (
    code VARCHAR(16) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    color VARCHAR(20) NOT NULL,
    text_color VARCHAR(20) DEFAULT '#FFFFFF',
    is_work_shift TINYINT DEFAULT 1,
    sort_order INT DEFAULT 99
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'lector',
    is_active TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS user_departments (
    user_id INT NOT NULL,
    department_id INT NOT NULL,
    PRIMARY KEY (user_id, department_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
  )`,

  // Bitácora de firmas/rechazos del flujo de aprobación (alimenta la línea de tiempo)
  `CREATE TABLE IF NOT EXISTS schedule_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_month_id INT NOT NULL,
    level INT NOT NULL,
    position VARCHAR(30) NOT NULL,
    user_id INT,
    user_name VARCHAR(255),
    action VARCHAR(20) NOT NULL,            -- 'sign' | 'reject'
    target_level INT,                        -- a qué nivel se devolvió (en rechazos)
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_month_id) REFERENCES schedule_months(id)
  )`,

  // Notificaciones in-app (campanita)
  `CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    schedule_month_id INT,
    type VARCHAR(30),
    title VARCHAR(255),
    body TEXT,
    is_read TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  // Plantillas reutilizables de rol mensual
  `CREATE TABLE IF NOT EXISTS schedule_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS schedule_template_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    employee_id INT NOT NULL,
    day INT NOT NULL,
    shift_code VARCHAR(10) NOT NULL,
    UNIQUE KEY uq_tpl_entry (template_id, employee_id, day),
    FOREIGN KEY (template_id) REFERENCES schedule_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`,
];

// Columnas que se agregan a tablas existentes (MySQL 8 no soporta ADD COLUMN IF NOT EXISTS)
const COLUMNS = [
  { table: 'users',           column: 'approval_position', def: "VARCHAR(30) NULL" },
  { table: 'users',           column: 'email',             def: "VARCHAR(255) NULL" },
  { table: 'users',           column: 'signature',         def: "LONGTEXT NULL" },        // firma (data URL: imagen o PDF)
  { table: 'users',           column: 'employee_id',       def: "INT NULL" },             // vincula la cuenta de login con su registro de empleada (ve solo su horario)
  { table: 'schedule_months', column: 'approval_state',    def: "VARCHAR(20) NOT NULL DEFAULT 'draft'" },
  { table: 'schedule_months', column: 'current_level',     def: "INT NOT NULL DEFAULT 1" },
  { table: 'shift_types',     column: 'start_time',        def: "VARCHAR(5) NULL" },   // hora inicio "HH:MM"
  { table: 'shift_types',     column: 'end_time',          def: "VARCHAR(5) NULL" },   // hora fin "HH:MM"
];

async function ensureColumns(pool) {
  for (const c of COLUMNS) {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=?`,
      [DB_NAME, c.table, c.column]
    );
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE \`${c.table}\` ADD COLUMN \`${c.column}\` ${c.def}`);
    }
  }
}

// Normaliza los parámetros: acepta un valor suelto, un array, o nada (igual que el wrapper de sqlite)
function norm(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

// Adaptador con la misma API que usábamos en sqlite: get / all / run / exec
function makeAdapter(pool) {
  return {
    async get(sql, params) {
      const [rows] = await pool.query(sql, norm(params));
      return rows[0];
    },
    async all(sql, params) {
      const [rows] = await pool.query(sql, norm(params));
      return rows;
    },
    async run(sql, params) {
      const [res] = await pool.query(sql, norm(params));
      return { lastID: res.insertId, changes: res.affectedRows };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    pool,
  };
}

async function getDb() {
  if (_db) return _db;

  // 1) Crear el esquema si no existe (conectando sin base seleccionada)
  const root = await mysql.createConnection(CFG);
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  // 2) Pool ya apuntando a la base
  _pool = mysql.createPool({ ...CFG, database: DB_NAME, waitForConnections: true, connectionLimit: 10 });

  // 3) Crear las tablas y aplicar migraciones de columnas
  for (const stmt of TABLES) await _pool.query(stmt);
  await ensureColumns(_pool);

  _db = makeAdapter(_pool);
  return _db;
}

module.exports = { getDb };
