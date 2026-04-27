/**
 * Integration tests for /api/messages/* routes.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-clipbridge';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://clipbridge:clipbridge@localhost:5432/clipbridge_test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/server');
const { pool, runMigrations } = require('../../src/db');
const identity = require('../../src/services/identity.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function cleanDb() {
  await pool.query('DELETE FROM messages');
  await pool.query('DELETE FROM users');
  identity.activeGuestIds.clear();
}

async function registerUser(username, password = 'pass123') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, password });
  return res.body; // { id, token }
}

function makeExpiredToken(userId) {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { expiresIn: -1 }, // already expired
  );
}

// ── Suite setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await pool.end();
});

// ─── Authentication guard ─────────────────────────────────────────────────────

describe('Authentication guard', () => {
  test('GET /api/messages returns 401 with no token', async () => {
    const res = await request(app).get('/api/messages');
    expect(res.status).toBe(401);
  });

  test('POST /api/messages returns 401 with no token', async () => {
    const res = await request(app).post('/api/messages').send({ to: 1001, text: 'hi' });
    expect(res.status).toBe(401);
  });

  test('DELETE /api/messages/1 returns 401 with no token', async () => {
    const res = await request(app).delete('/api/messages/1');
    expect(res.status).toBe(401);
  });

  test('401 with expired token', async () => {
    const alice = await registerUser('alice');
    const expired = makeExpiredToken(alice.id);

    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test('401 with token signed using wrong secret', async () => {
    const badToken = jwt.sign({ sub: 1000 }, 'wrong-secret');
    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  test('401 with malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/messages ───────────────────────────────────────────────────────

describe('POST /api/messages', () => {
  test('201 + message object for valid send', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: bob.id, text: 'Hello Bob!' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      from: alice.id,
      to: bob.id,
      text: 'Hello Bob!',
    });
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('ts');
  });

  test('allows self-send', async () => {
    const alice = await registerUser('alice');

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: alice.id, text: 'note to self' });

    expect(res.status).toBe(201);
    expect(res.body.from).toBe(alice.id);
    expect(res.body.to).toBe(alice.id);
  });

  test('400 when "to" field is missing', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ text: 'hi' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 when "text" field is missing', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: bob.id });

    expect(res.status).toBe(400);
  });

  test('400 when "to" is not a valid ID', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: 99, text: 'hi' });

    expect(res.status).toBe(400);
  });

  test('400 when "text" is empty string', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: bob.id, text: '   ' });

    expect(res.status).toBe(400);
  });

  test('404 when recipient does not exist', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: 3999, text: 'hello ghost' });

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/messages ────────────────────────────────────────────────────────

describe('GET /api/messages', () => {
  test('200 + empty array when inbox is empty', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('200 + messages array after receiving a message', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: bob.id, text: 'Hey Bob' });

    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${bob.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ text: 'Hey Bob', from: alice.id });
  });

  test('inbox only contains messages addressed to the current user', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');

    // alice → bob, carol → bob, alice → carol
    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: bob.id, text: 'to bob' });

    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${carol.token}`)
      .send({ to: bob.id, text: 'also to bob' });

    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: carol.id, text: 'to carol' });

    const bobInbox = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${bob.token}`);

    expect(bobInbox.body).toHaveLength(2);
    bobInbox.body.forEach((m) => expect(m.to).toBe(bob.id));
  });

  test('messages are returned newest first', async () => {
    const alice = await registerUser('alice');

    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: alice.id, text: 'first' });

    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: alice.id, text: 'second' });

    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.body[0].text).toBe('second');
    expect(res.body[1].text).toBe('first');
  });
});

// ─── DELETE /api/messages/:id ─────────────────────────────────────────────────

describe('DELETE /api/messages/:id', () => {
  test('204 on successful dismiss', async () => {
    const alice = await registerUser('alice');

    // self-send to get a message
    const sendRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: alice.id, text: 'delete me' });

    const msgId = sendRes.body.id;

    const res = await request(app)
      .delete(`/api/messages/${msgId}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(204);
  });

  test('404 for non-existent message ID', async () => {
    const alice = await registerUser('alice');

    const res = await request(app)
      .delete('/api/messages/99999')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(404);
  });

  test('404 when trying to delete someone else\'s message', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const sendRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: bob.id, text: 'secret' });

    // Alice tries to delete a message in Bob's inbox
    const res = await request(app)
      .delete(`/api/messages/${sendRes.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(404);
  });

  test('400 for non-numeric message ID', async () => {
    const alice = await registerUser('alice');

    const res = await request(app)
      .delete('/api/messages/abc')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(400);
  });

  test('message is gone from inbox after deletion', async () => {
    const alice = await registerUser('alice');

    const sendRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ to: alice.id, text: 'ephemeral' });

    await request(app)
      .delete(`/api/messages/${sendRes.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`);

    const inbox = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(inbox.body).toHaveLength(0);
  });
});
