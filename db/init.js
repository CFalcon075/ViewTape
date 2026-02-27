const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'viewtape.db');

let _db = null;
let _SQL = null;

async function initSql() {
  if (!_SQL) {
    _SQL = await initSqlJs();
  }
  return _SQL;
}

function loadDb() {
  if (_db) return _db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    _db = new _SQL.Database(buffer);
  } else {
    _db = new _SQL.Database();
  }
  _db.run('PRAGMA foreign_keys = ON');
  return _db;
}

function saveDb() {
  if (_db) {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  return loadDb();
}

async function initializeDb() {
  await initSql();
  loadDb();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // sql.js requires executing statements one at a time
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    _db.run(stmt + ';');
  }
  // Migrations: add new columns if they don't exist on older DBs
  const migrations = [
    "ALTER TABLE users ADD COLUMN banner TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN snow_enabled INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN age TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN website TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN country TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN interests TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN channel_theme TEXT DEFAULT 'grey'",
    "ALTER TABLE users ADD COLUMN videos_watched INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_sign_in DATETIME DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE users ADD COLUMN custom_colors TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT ''"
  ];
  for (const mig of migrations) {
    try { _db.run(mig); } catch (e) { /* column already exists */ }
  }
  saveDb();
  console.log('[ViewTape] Database initialized at', DB_PATH);
}

// Helper: run a statement (INSERT/UPDATE/DELETE) and return { lastInsertRowid, changes }
function dbRun(sql, params) {
  const db = getDb();
  db.run(sql, params);
  const lastId = db.exec('SELECT last_insert_rowid() as id');
  const changes = db.exec('SELECT changes() as c');
  saveDb();
  return {
    lastInsertRowid: lastId.length > 0 ? lastId[0].values[0][0] : 0,
    changes: changes.length > 0 ? changes[0].values[0][0] : 0
  };
}

// Helper: get one row
function dbGet(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper: get all rows
function dbAll(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { initializeDb, getDb, saveDb, dbRun, dbGet, dbAll };
