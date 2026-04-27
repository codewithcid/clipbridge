/**
 * Unit tests for identity.service.js
 *
 * These tests mock the database module so they run without a live PostgreSQL
 * connection.
 */

jest.mock('../../src/db');

const db = require('../../src/db');
const identity = require('../../src/services/identity.service');

beforeEach(() => {
  // Clear the in-memory guest set between tests
  identity.activeGuestIds.clear();
  jest.clearAllMocks();
});

// ─── getNextRegisteredId ────────────────────────────────────────────────────

describe('getNextRegisteredId()', () => {
  test('returns 1000 when no registered users exist yet', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '999' }] });
    const id = await identity.getNextRegisteredId();
    expect(id).toBe(1000);
  });

  test('returns max+1 when some users already exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '1042' }] });
    const id = await identity.getNextRegisteredId();
    expect(id).toBe(1043);
  });

  test('returns 1001 after alice is seeded at 1001 (max = 1001)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '1001' }] });
    const id = await identity.getNextRegisteredId();
    expect(id).toBe(1002);
  });

  test('throws ID_EXHAUSTED when max is at the ceiling (4999)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '4999' }] });
    await expect(identity.getNextRegisteredId()).rejects.toMatchObject({
      code: 'ID_EXHAUSTED',
    });
  });

  test('throws when max exceeds ceiling', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '5000' }] });
    await expect(identity.getNextRegisteredId()).rejects.toThrow();
  });

  test('passes correct SQL parameters to db.query', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '999' }] });
    await identity.getNextRegisteredId();
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      identity.REGISTERED_MIN,
      identity.REGISTERED_MAX,
    ]);
  });

  test('allocated ID is within registered range', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_id: '2000' }] });
    const id = await identity.getNextRegisteredId();
    expect(id).toBeGreaterThanOrEqual(identity.REGISTERED_MIN);
    expect(id).toBeLessThanOrEqual(identity.REGISTERED_MAX);
  });
});

// ─── assignGuestId ──────────────────────────────────────────────────────────

describe('assignGuestId()', () => {
  test('returns a number in the guest range (5000–9999)', () => {
    const id = identity.assignGuestId();
    expect(id).toBeGreaterThanOrEqual(identity.GUEST_MIN);
    expect(id).toBeLessThanOrEqual(identity.GUEST_MAX);
  });

  test('adds the ID to activeGuestIds', () => {
    const id = identity.assignGuestId();
    expect(identity.activeGuestIds.has(id)).toBe(true);
  });

  test('two consecutive calls return distinct IDs', () => {
    const a = identity.assignGuestId();
    const b = identity.assignGuestId();
    expect(a).not.toBe(b);
  });

  test('throws ID_EXHAUSTED when all guest slots are occupied', () => {
    // Fill every slot
    for (let i = identity.GUEST_MIN; i <= identity.GUEST_MAX; i++) {
      identity.activeGuestIds.add(i);
    }
    expect(() => identity.assignGuestId()).toThrow(
      expect.objectContaining({ code: 'ID_EXHAUSTED' }),
    );
  });

  test('can allocate an ID after another is released', () => {
    // Fill all but one slot
    for (let i = identity.GUEST_MIN; i <= identity.GUEST_MAX; i++) {
      identity.activeGuestIds.add(i);
    }
    identity.activeGuestIds.delete(7777);
    const id = identity.assignGuestId();
    expect(id).toBe(7777);
  });
});

// ─── releaseGuestId ─────────────────────────────────────────────────────────

describe('releaseGuestId()', () => {
  test('removes the ID from activeGuestIds', () => {
    const id = identity.assignGuestId();
    expect(identity.activeGuestIds.has(id)).toBe(true);
    identity.releaseGuestId(id);
    expect(identity.activeGuestIds.has(id)).toBe(false);
  });

  test('is a no-op for an ID that was never assigned', () => {
    expect(() => identity.releaseGuestId(9998)).not.toThrow();
  });
});

// ─── isRegisteredId / isGuestId ─────────────────────────────────────────────

describe('isRegisteredId()', () => {
  test('returns true for 1000', () => expect(identity.isRegisteredId(1000)).toBe(true));
  test('returns true for 4999', () => expect(identity.isRegisteredId(4999)).toBe(true));
  test('returns false for 999',  () => expect(identity.isRegisteredId(999)).toBe(false));
  test('returns false for 5000', () => expect(identity.isRegisteredId(5000)).toBe(false));
});

describe('isGuestId()', () => {
  test('returns true for 5000', () => expect(identity.isGuestId(5000)).toBe(true));
  test('returns true for 9999', () => expect(identity.isGuestId(9999)).toBe(true));
  test('returns false for 4999', () => expect(identity.isGuestId(4999)).toBe(false));
  test('returns false for 10000',() => expect(identity.isGuestId(10000)).toBe(false));
});
