const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'rolturno.db');

let _db = null;

async function getDb() {
  if (_db) return _db;

  await fs.ensureDir(path.dirname(DB_PATH));

  _db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await _db.exec('PRAGMA journal_mode = WAL');
  await _db.exec('PRAGMA foreign_keys = ON');

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      supervisor TEXT,
      area_chief TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      clave TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      role TEXT DEFAULT 'rotativa',
      is_active INTEGER DEFAULT 1,
      observations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS schedule_months (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(department_id, year, month),
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS schedule_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_month_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      day INTEGER NOT NULL,
      shift_code TEXT NOT NULL DEFAULT 'L',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(schedule_month_id, employee_id, day),
      FOREIGN KEY (schedule_month_id) REFERENCES schedule_months(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS shift_types (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL,
      text_color TEXT DEFAULT '#FFFFFF',
      is_work_shift INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 99
    );
  `);

  return _db;
}

module.exports = { getDb };
