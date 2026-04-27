# ClipBridge

Cross-device clipboard sharing — every user gets a permanent 4-digit ID and anyone with that ID can send text messages to their inbox in real-time.

## Features

- **4-digit IDs** — registered users get IDs 1000–4999; guests get temporary IDs 5000–9999
- **Real-time delivery** — WebSocket push means you see incoming messages instantly, no refresh needed
- **Guest mode** — try the app without creating an account
- **Self-send** — quickly save notes or clipboard content to your own inbox
- **Dark utilitarian UI** — JetBrains Mono + Syne, accent green `#00C896`

---

## Screenshots

> _Add screenshots here after running the app._

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20 |
| HTTP framework | Express.js v4 |
| Real-time | `ws` WebSocket library |
| Database | PostgreSQL 16 via `pg` (node-postgres) |
| Auth | bcrypt (cost 12) + JWT HS256 (24 h expiry) |
| Frontend | Vanilla HTML / CSS / JavaScript (no framework) |
| Testing | Jest + Supertest (unit + integration), Cypress (E2E) |
| Container | Docker + docker-compose |

---

## Setup

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 16 (or Docker)

### 1 — Clone & install

```bash
git clone <repo-url> clipbridge
cd clipbridge/backend
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL, JWT_SECRET, PORT
```

### 3 — Start PostgreSQL (Docker)

```bash
# From the repo root
docker-compose up -d postgres
```

### 4 — Run migrations & seed

```bash
cd backend
npm run migrate   # creates tables
npm run seed      # inserts alice (1001) and bob (1002)
```

### 5 — Start the server

```bash
npm run dev       # nodemon (auto-reload)
# or
npm start         # plain node
```

The app is now at **http://localhost:4000**.  
Seed credentials: `alice / alice123` → `#1001`, `bob / bob123` → `#1002`.

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start server with `node` |
| `npm run dev` | Start server with `nodemon` (auto-reload) |
| `npm test` | Run unit + integration tests (Jest) |
| `npm run test:coverage` | Run tests + generate HTML coverage report (`coverage/`) |
| `npm run migrate` | Apply database migrations |
| `npm run seed` | Insert seed users |

### E2E (Cypress)

```bash
# from repo root – make sure the backend is running first
cd cypress
npx cypress open          # interactive
npx cypress run           # headless CI mode
```

---

## API Reference

All authenticated endpoints require `Authorization: Bearer <token>`.

| Method | Path | Auth | Body | Success | Description |
|--------|------|------|------|---------|-------------|
| `POST` | `/api/auth/register` | — | `{ username, password }` | `201 { id, token }` | Create a registered account |
| `POST` | `/api/auth/login` | — | `{ username, password }` | `200 { id, token }` | Log in |
| `POST` | `/api/auth/guest` | — | — | `200 { id, token }` | Create a guest session |
| `POST` | `/api/messages` | ✓ | `{ to, text }` | `201 { id, from, to, text, ts }` | Send a message |
| `GET` | `/api/messages` | ✓ | — | `200 [ messages ]` | Get inbox (newest first) |
| `DELETE` | `/api/messages/:id` | ✓ | — | `204` | Dismiss a message |

### Error format

```json
{ "error": "human-readable message" }
```

| Code | Meaning |
|------|---------|
| 400 | Missing / invalid fields |
| 401 | Missing, expired, or invalid JWT |
| 404 | Resource not found |
| 409 | Duplicate username |
| 503 | ID range exhausted |

---

## WebSocket Protocol

Connect to `ws://localhost:4000?token=<jwt>`.

**Server → Client events:**

```json
{ "type": "CONNECTED", "userId": 1234 }
{ "type": "NEW_MESSAGE", "message": { "id": 1, "from": 1001, "to": 1234, "text": "...", "ts": "..." } }
```

---

## Database Schema

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY CHECK (id BETWEEN 1000 AND 9999),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(60) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id         SERIAL PRIMARY KEY,
  from_id    INTEGER NOT NULL,
  to_id      INTEGER NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_messages_to_id ON messages(to_id);
```

---

## Running Tests

### Unit + Integration (Jest)

Integration tests require a running PostgreSQL test database:

```bash
docker-compose up -d postgres_test

# point tests at the test DB
export DATABASE_URL=postgres://clipbridge:clipbridge@localhost:5433/clipbridge_test

cd backend
npm test
npm run test:coverage   # generates coverage/index.html
```

### E2E (Cypress)

```bash
# Terminal 1 – start backend
cd backend && npm run dev

# Terminal 2 – run Cypress
cd cypress
npx cypress run
```

---

## Project Structure

```
clipbridge/
├── backend/
│   ├── src/
│   │   ├── server.js          Express + HTTP entry point
│   │   ├── db.js              pg pool + migrations + seed
│   │   ├── ws.js              WebSocket server
│   │   ├── routes/
│   │   │   ├── auth.js        /api/auth/*
│   │   │   └── messages.js    /api/messages/*
│   │   ├── services/
│   │   │   ├── auth.service.js
│   │   │   ├── identity.service.js
│   │   │   └── message.service.js
│   │   └── middleware/
│   │       └── authenticate.js
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── migrations/
│       └── 001_init.sql
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── cypress/
│   └── e2e/
├── docker-compose.yml
└── README.md
```
