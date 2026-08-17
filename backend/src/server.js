require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');

const { runMigrations, runSeed } = require('./db');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const { attachWebSocketServer } = require('./ws');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the frontend.
// FRONTEND_PATH env var lets Railway/Render override the default relative path.
const frontendPath = process.env.FRONTEND_PATH
  ? path.resolve(process.env.FRONTEND_PATH)
  : path.join(__dirname, '../../frontend');

app.use(express.static(frontendPath));

// Flipped once migrations + seed succeed; see prepareDatabase() below.
let dbReady = false;

// ── Health check ────────────────────────────────────────────────────────────
// Always answers, even while the database is still coming up, so uptime
// pingers can keep the free instance warm.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: dbReady ? 'ready' : 'connecting',
    uptime: Math.round(process.uptime()),
  });
});

// ── API routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// Fallback: serve the SPA for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Error handler ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Bootstrap ───────────────────────────────────────────────────────────────

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/**
 * Run migrations + seed, retrying forever with a capped backoff.
 *
 * Deliberately never exits the process: a database that is unreachable,
 * asleep, or still provisioning should degrade the API, not take the whole
 * service down and leave visitors on a 503.
 */
async function prepareDatabase() {
  let delay = RETRY_MIN_MS;

  for (let attempt = 1; ; attempt += 1) {
    try {
      await runMigrations();
      await runSeed();
      dbReady = true;
      console.log('Database ready.');
      return;
    } catch (err) {
      console.error(`Database unavailable (attempt ${attempt}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }
  }
}

function start() {
  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`ClipBridge backend listening on port ${PORT}`);
  });

  // Connect in the background — the server is already accepting requests.
  prepareDatabase();
}

// Only auto-start when run directly (not when required by tests)
if (require.main === module) {
  start();
}

module.exports = app;
