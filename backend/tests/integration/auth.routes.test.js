/**
 * Integration tests for /api/auth/* routes.
 *
 * Uses a real PostgreSQL test database (DATABASE_URL env var).
 * The DB is wiped and re-seeded before the suite runs.
 */

// Ensure env is set before any require
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-clipbridge';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://clipbridge:clipbridge@localhost:5432/clipbridge_test';

const request = require('supertest');
const app = require('../../src/server');
const { pool, runMigrations } = require('../../src/db');
const identity = require('../../src/services/identity.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function cleanDb() {
  await pool.query('DELETE FROM messages');
  await pool.query('DELETE FROM users');
  identity.activeGuestIds.clear();
}

// ── Suite setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await pool.end();
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('201 + { id, token } for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'carol', password: 'carol123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('token');
    expect(res.body.id).toBeGreaterThanOrEqual(1000);
    expect(res.body.id).toBeLessThanOrEqual(4999);
  });

  test('assigned ID is sequential (first = 1000)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'first', password: 'pass123' });

    expect(res.body.id).toBe(1000);
  });

  test('second user gets id 1001', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'user1', password: 'pass123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user2', password: 'pass123' });

    expect(res.body.id).toBe(1001);
  });

  test('400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'pass123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'carol' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'carol', password: 'abc' });

    expect(res.status).toBe(400);
  });

  test('409 on duplicate username', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'dupuser', password: 'pass123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'dupuser', password: 'different1' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  test('returned token is a valid JWT', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'tokentest', password: 'pass123' });

    const parts = res.body.token.split('.');
    expect(parts).toHaveLength(3);
  });
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'alice123' });
  });

  test('200 + { id, token } for correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'alice123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('token');
  });

  test('401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('401 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'pass123' });

    expect(res.status).toBe(401);
  });

  test('400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'alice123' });

    expect(res.status).toBe(400);
  });

  test('400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice' });

    expect(res.status).toBe(400);
  });

  test('login token allows authenticated requests', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'alice123' });

    const inboxRes = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(inboxRes.status).toBe(200);
  });
});

// ─── POST /api/auth/guest ────────────────────────────────────────────────────

describe('POST /api/auth/guest', () => {
  test('200 + { id, token }', async () => {
    const res = await request(app).post('/api/auth/guest').send();

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('token');
  });

  test('guest ID is in range 5000–9999', async () => {
    const res = await request(app).post('/api/auth/guest').send();

    expect(res.body.id).toBeGreaterThanOrEqual(5000);
    expect(res.body.id).toBeLessThanOrEqual(9999);
  });

  test('two consecutive guest calls return distinct IDs', async () => {
    const [r1, r2] = await Promise.all([
      request(app).post('/api/auth/guest').send(),
      request(app).post('/api/auth/guest').send(),
    ]);

    expect(r1.body.id).not.toBe(r2.body.id);
  });

  test('guest token allows authenticated requests', async () => {
    const guestRes = await request(app).post('/api/auth/guest').send();

    const inboxRes = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${guestRes.body.token}`);

    expect(inboxRes.status).toBe(200);
  });
});
