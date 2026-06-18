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
];

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

  // 3) Crear las tablas
  for (const stmt of TABLES) await _pool.query(stmt);

  _db = makeAdapter(_pool);
  return _db;
}

module.exports = { getDb };
