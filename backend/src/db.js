const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Load .env only when not in test mode (test runner sets DATABASE_URL directly)
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}

// Render (and most cloud PG providers) require SSL for external connections.
// We enable it whenever the DATABASE_URL contains a remote host, but allow
// self-signed certs so local Docker setups still work without extra config.
const isRemoteDb =
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

/**
 * Execute a parameterised query and return the pg Result object.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Read and execute the migration SQL.  Uses IF NOT EXISTS so it is idempotent.
 */
async function runMigrations() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../migrations/001_init.sql'),
    'utf8',
  );
  await pool.query(sql);
  console.log('Migrations applied.');
}

/**
 * Insert seed users (alice → 1001, bob → 1002).
 * Silently skips if rows already exist.
 */
async function runSeed() {
  const COST = 12;
  const users = [
    { id: 1001, username: 'alice', password: 'alice123' },
    { id: 1002, username: 'bob',   password: 'bob123'   },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, COST);
    await pool.query(
      `INSERT INTO users (id, username, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [u.id, u.username, hash],
    );
  }
  console.log('Seed data inserted (alice → 1001, bob → 1002).');
}

module.exports = { query, pool, runMigrations, runSeed };
