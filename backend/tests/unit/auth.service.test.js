/**
 * Unit tests for auth.service.js
 *
 * Database and identity service are mocked.
 */

// Set the secret before requiring the service
process.env.JWT_SECRET = 'unit-test-secret';
process.env.DATABASE_URL = 'postgres://test:test@localhost/test';

jest.mock('../../src/db');
jest.mock('../../src/services/identity.service');

const db = require('../../src/db');
const identity = require('../../src/services/identity.service');
const auth = require('../../src/services/auth.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── hashPassword / verifyPassword ──────────────────────────────────────────

describe('hashPassword()', () => {
  test('returns a bcrypt hash string', async () => {
    const hash = await auth.hashPassword('secret');
    expect(hash).toMatch(/^\$2b\$/);
  });

  test('hash is different from plain text', async () => {
    const hash = await auth.hashPassword('mypass');
    expect(hash).not.toBe('mypass');
  });

  test('two hashes of the same password differ (salt)', async () => {
    const [h1, h2] = await Promise.all([
      auth.hashPassword('same'),
      auth.hashPassword('same'),
    ]);
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword()', () => {
  test('returns true for the matching password', async () => {
    const hash = await auth.hashPassword('correct');
    expect(await auth.verifyPassword('correct', hash)).toBe(true);
  });

  test('returns false for a wrong password', async () => {
    const hash = await auth.hashPassword('correct');
    expect(await auth.verifyPassword('wrong', hash)).toBe(false);
  });
});

// ─── signToken / verifyToken ─────────────────────────────────────────────────

describe('signToken() / verifyToken()', () => {
  test('signed token contains the expected sub claim', () => {
    const token = auth.signToken(1234);
    const payload = auth.verifyToken(token);
    expect(String(payload.sub)).toBe('1234');
  });

  test('verifyToken throws on a tampered token', () => {
    const token = auth.signToken(1234);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(() => auth.verifyToken(tampered)).toThrow();
  });

  test('verifyToken throws on a token signed with a different secret', () => {
    const jwt = require('jsonwebtoken');
    const badToken = jwt.sign({ sub: 9999 }, 'wrong-secret');
    expect(() => auth.verifyToken(badToken)).toThrow();
  });

  test('token is a three-segment JWT string', () => {
    const token = auth.signToken(5000);
    expect(token.split('.')).toHaveLength(3);
  });
});

// ─── register ────────────────────────────────────────────────────────────────

describe('register()', () => {
  test('resolves with id and token on success', async () => {
    identity.getNextRegisteredId.mockResolvedValueOnce(1000);
    db.query.mockResolvedValueOnce({ rows: [] }); // INSERT succeeds

    const result = await auth.register('charlie', 'password1');
    expect(result).toHaveProperty('id', 1000);
    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
  });

  test('throws VALIDATION for empty username', async () => {
    await expect(auth.register('', 'pass123')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  test('throws VALIDATION for short password (< 6 chars)', async () => {
    await expect(auth.register('user', 'abc')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  test('throws DUPLICATE_USERNAME on pg 23505 constraint error', async () => {
    identity.getNextRegisteredId.mockResolvedValueOnce(1001);
    const pgErr = new Error('unique violation');
    pgErr.code = '23505';
    db.query.mockRejectedValueOnce(pgErr);

    await expect(auth.register('alice', 'password1')).rejects.toMatchObject({
      code: 'DUPLICATE_USERNAME',
    });
  });

  test('propagates ID_EXHAUSTED from identity service', async () => {
    const idErr = new Error('ID range exhausted');
    idErr.code = 'ID_EXHAUSTED';
    identity.getNextRegisteredId.mockRejectedValueOnce(idErr);

    await expect(auth.register('new', 'password1')).rejects.toMatchObject({
      code: 'ID_EXHAUSTED',
    });
  });
});

// ─── login ───────────────────────────────────────────────────────────────────

describe('login()', () => {
  test('returns id and token for correct credentials', async () => {
    const hash = await auth.hashPassword('secret');
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1001, password_hash: hash }],
    });

    const result = await auth.login('alice', 'secret');
    expect(result.id).toBe(1001);
    expect(result.token).toBeDefined();
  });

  test('throws INVALID_CREDENTIALS for unknown username', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(auth.login('nobody', 'pass')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  test('throws INVALID_CREDENTIALS for wrong password', async () => {
    const hash = await auth.hashPassword('correct');
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1002, password_hash: hash }],
    });

    await expect(auth.login('bob', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  test('throws VALIDATION when username is missing', async () => {
    await expect(auth.login('', 'pass')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});
