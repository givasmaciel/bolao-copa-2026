const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/bolao',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function convertSql(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function prepareSql(sql) {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('INSERT') && !trimmed.includes('RETURNING')) {
    return sql + ' RETURNING id';
  }
  return sql;
}

async function run(sql, params = []) {
  const result = await pool.query(prepareSql(convertSql(sql)), params);
  return {
    lastID: result.rows[0]?.id || null,
    changes: result.rowCount,
    rows: result.rows
  };
}

async function get(sql, params = []) {
  const result = await pool.query(convertSql(sql), params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await pool.query(convertSql(sql), params);
  return result.rows;
}

module.exports = { run, get, all, pool };
