const path = require('path');
const fs = require('fs');

const usandoPG = !!process.env.DATABASE_URL;

let pgPool, sqlite3, db;

if (usandoPG) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  sqlite3 = require('sqlite3').verbose();
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'bolao.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao abrir banco SQLite:', err.message);
      process.exit(1);
    }
  });
  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
  });
}

function sqliteRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function sqliteGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function sqliteAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function pgRun(sql, params) {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('INSERT') && !trimmed.includes('RETURNING')) {
    sql += ' RETURNING id';
  }
  let idx = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
  return pgPool.query(pgSql, params).then(result => ({
    lastID: result.rows[0]?.id || null,
    changes: result.rowCount
  }));
}

function pgGet(sql, params) {
  let idx = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
  return pgPool.query(pgSql, params).then(result => result.rows[0] || null);
}

function pgAll(sql, params) {
  let idx = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
  return pgPool.query(pgSql, params).then(result => result.rows);
}

const run = usandoPG ? pgRun : sqliteRun;
const get = usandoPG ? pgGet : sqliteGet;
const all = usandoPG ? pgAll : sqliteAll;

module.exports = { run, get, all };
