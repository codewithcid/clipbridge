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
async function start() {
  await runMigrations();
  await runSeed();

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`ClipBridge backend listening on http://localhost:${PORT}`);
  });
}

// Only auto-start when run directly (not when required by tests)
if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

module.exports = app;
