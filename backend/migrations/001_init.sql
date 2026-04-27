-- ClipBridge initial schema
-- Run once; safe to re-run (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY CHECK (id BETWEEN 1000 AND 9999),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(60) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  from_id    INTEGER NOT NULL,
  to_id      INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_to_id ON messages(to_id);
