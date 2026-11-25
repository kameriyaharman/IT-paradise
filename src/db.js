const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const conn = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/itp';
const pool = new Pool({
  connectionString: conn,
  ssl: /sslmode=require/.test(conn) ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

async function q(text, params) { return (await pool.query(text, params)).rows; }
async function one(text, params) { return (await pool.query(text, params)).rows[0] || null; }

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const c = {
      q: async (t, p) => (await client.query(t, p)).rows,
      one: async (t, p) => (await client.query(t, p)).rows[0] || null,
    };
    const r = await fn(c);
    await client.query('COMMIT');
    return r;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// Sequential document numbers: QT-2611-0412 style
async function nextNumber(prefix, opts = {}) {
  const r = await one(`INSERT INTO counters(name,value) VALUES($1,1) ON CONFLICT(name) DO UPDATE SET value=counters.value+1 RETURNING value`, [prefix]);
  const n = String(r.value + (opts.offset || 0)).padStart(4, '0');
  if (opts.dated) {
    const d = new Date(); const dd = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    return `${prefix}-${dd}-${n}`;
  }
  return `${prefix}-${n}`;
}

async function migrate() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

const settingsCache = { at: 0, data: {} };
async function getSettings(force) {
  if (!force && Date.now() - settingsCache.at < 15000) return settingsCache.data;
  const rows = await q('SELECT key,value FROM settings');
  settingsCache.data = Object.fromEntries(rows.map(r => [r.key, r.value]));
  settingsCache.at = Date.now();
  return settingsCache.data;
}
async function setSetting(key, value) {
  await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [key, value == null ? '' : String(value)]);
  settingsCache.at = 0;
}

module.exports = { pool, q, one, tx, nextNumber, migrate, getSettings, setSetting };
