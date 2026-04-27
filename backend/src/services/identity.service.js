const db = require('../db');

// Registered users occupy 1000–4999 (4 000 slots).
const REGISTERED_MIN = 1000;
const REGISTERED_MAX = 4999;

// Guests occupy 5000–9999 (5 000 slots).
const GUEST_MIN = 5000;
const GUEST_MAX = 9999;

// In-memory set of IDs currently claimed by guest sessions.
const activeGuestIds = new Set();

/**
 * Return the next sequential ID available for a new registered user.
 * Throws if the range is exhausted.
 */
async function getNextRegisteredId() {
  const result = await db.query(
    `SELECT COALESCE(MAX(id), ${REGISTERED_MIN - 1}) AS max_id
     FROM users
     WHERE id BETWEEN $1 AND $2`,
    [REGISTERED_MIN, REGISTERED_MAX],
  );

  const next = parseInt(result.rows[0].max_id, 10) + 1;

  if (next > REGISTERED_MAX) {
    const err = new Error('Registered ID range exhausted');
    err.code = 'ID_EXHAUSTED';
    throw err;
  }

  return next;
}

/**
 * Pick a random, unused ID in the guest range (5000–9999).
 * "Unused" means not in activeGuestIds.
 * Throws if every slot is taken.
 */
function assignGuestId() {
  const total = GUEST_MAX - GUEST_MIN + 1; // 5000

  // Shuffle via Fisher-Yates on a lazy random probe (good enough for 5 000 slots)
  const tried = new Set();

  while (tried.size < total) {
    const candidate =
      Math.floor(Math.random() * total) + GUEST_MIN;

    if (!activeGuestIds.has(candidate)) {
      activeGuestIds.add(candidate);
      return candidate;
    }
    tried.add(candidate);
  }

  const err = new Error('Guest ID range exhausted');
  err.code = 'ID_EXHAUSTED';
  throw err;
}

/**
 * Release a guest ID back to the pool (call on disconnect / sign-out).
 */
function releaseGuestId(id) {
  activeGuestIds.delete(id);
}

/**
 * Check whether a numeric ID is in the registered user range.
 */
function isRegisteredId(id) {
  return id >= REGISTERED_MIN && id <= REGISTERED_MAX;
}

/**
 * Check whether a numeric ID is in the guest range.
 */
function isGuestId(id) {
  return id >= GUEST_MIN && id <= GUEST_MAX;
}

module.exports = {
  getNextRegisteredId,
  assignGuestId,
  releaseGuestId,
  isRegisteredId,
  isGuestId,
  // Expose internals for tests
  activeGuestIds,
  REGISTERED_MIN,
  REGISTERED_MAX,
  GUEST_MIN,
  GUEST_MAX,
};
