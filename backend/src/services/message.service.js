const db = require('../db');

const MAX_TEXT_LENGTH = 10000;

/**
 * Send a message from one user to another.
 * Returns the created message record.
 * Throws validation or recipient-not-found errors.
 */
async function sendMessage(fromId, toId, text) {
  // Validate inputs
  if (toId === undefined || toId === null) {
    const err = new Error('"to" field is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const toIdNum = Number(toId);
  if (!Number.isInteger(toIdNum) || toIdNum < 1000 || toIdNum > 9999) {
    const err = new Error('"to" must be a 4-digit integer between 1000 and 9999');
    err.code = 'VALIDATION';
    throw err;
  }

  if (!text || typeof text !== 'string' || text.trim() === '') {
    const err = new Error('"text" field is required and must be a non-empty string');
    err.code = 'VALIDATION';
    throw err;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    const err = new Error(`"text" must not exceed ${MAX_TEXT_LENGTH} characters`);
    err.code = 'VALIDATION';
    throw err;
  }

  // Ensure recipient exists
  const recipientResult = await db.query(
    `SELECT id FROM users WHERE id = $1`,
    [toIdNum],
  );

  if (recipientResult.rows.length === 0) {
    const err = new Error(`Recipient #${toIdNum} does not exist`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const result = await db.query(
    `INSERT INTO messages (from_id, to_id, text)
     VALUES ($1, $2, $3)
     RETURNING id, from_id AS "from", to_id AS "to", text, created_at AS ts`,
    [fromId, toIdNum, text.trim()],
  );

  return result.rows[0];
}

/**
 * Fetch all messages in a user's inbox (ordered newest first).
 */
async function getInbox(userId) {
  const result = await db.query(
    `SELECT m.id,
            m.from_id AS "from",
            m.to_id   AS "to",
            m.text,
            m.created_at AS ts
     FROM messages m
     WHERE m.to_id = $1
     ORDER BY m.created_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * Delete a single message by ID.
 * Only the recipient may dismiss it.
 * Returns true if deleted, false if not found / not owned.
 */
async function deleteMessage(messageId, userId) {
  const result = await db.query(
    `DELETE FROM messages
     WHERE id = $1 AND to_id = $2`,
    [messageId, userId],
  );
  return result.rowCount > 0;
}

module.exports = { sendMessage, getInbox, deleteMessage };
