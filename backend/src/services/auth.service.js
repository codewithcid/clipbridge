const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const identity = require('./identity.service');

const BCRYPT_COST = 12;
const JWT_EXPIRY = '24h';

/**
 * Hash a plain-text password.
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Compare a plain-text password against a stored hash.
 */
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Sign a JWT for the given user ID.
 */
function signToken(userId) {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_EXPIRY },
  );
}

/**
 * Verify a JWT and return the decoded payload.  Throws on invalid/expired.
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Register a new user.
 * Returns { id, token }.
 * Throws { code: 'DUPLICATE_USERNAME' } if the username is taken.
 * Throws { code: 'ID_EXHAUSTED' } if the registered range is full.
 */
async function register(username, password) {
  if (!username || typeof username !== 'string' || username.trim() === '') {
    const err = new Error('Username is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.code = 'VALIDATION';
    throw err;
  }

  const id = await identity.getNextRegisteredId();
  const hash = await hashPassword(password);

  try {
    await db.query(
      `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
      [id, username.trim(), hash],
    );
  } catch (err) {
    if (err.code === '23505') {
      // Unique constraint violation on username
      const e = new Error('Username already taken');
      e.code = 'DUPLICATE_USERNAME';
      throw e;
    }
    throw err;
  }

  return { id, token: signToken(id) };
}

/**
 * Log in an existing user.
 * Returns { id, token }.
 * Throws { code: 'INVALID_CREDENTIALS' } on bad username/password.
 */
async function login(username, password) {
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.code = 'VALIDATION';
    throw err;
  }

  const result = await db.query(
    `SELECT id, password_hash FROM users WHERE username = $1`,
    [username],
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid username or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const { id, password_hash } = result.rows[0];
  const ok = await verifyPassword(password, password_hash);

  if (!ok) {
    const err = new Error('Invalid username or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  return { id, token: signToken(id) };
}

/**
 * Create a guest session (random ID 5000–9999).
 * Returns { id, token }.
 */
async function createGuest() {
  const guestUsername = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const id = identity.assignGuestId();
  const hash = await hashPassword(guestUsername); // dummy hash

  await db.query(
    `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
    [id, guestUsername, hash],
  );

  return { id, token: signToken(id) };
}

module.exports = { register, login, createGuest, signToken, verifyToken, hashPassword, verifyPassword };
