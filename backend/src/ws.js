const { WebSocketServer } = require('ws');
const { verifyToken } = require('./services/auth.service');

// Map<userId, WebSocket> — only one active socket per user (last-write-wins)
const clients = new Map();

/**
 * Attach the WebSocket upgrade handler to an existing HTTP server.
 */
function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket, req) => {
    // Authenticate via ?token= query param
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Missing token');
      return;
    }

    let userId;
    try {
      const payload = verifyToken(token);
      userId = Number(payload.sub);
    } catch {
      socket.close(4002, 'Invalid token');
      return;
    }

    // Register client
    clients.set(userId, socket);
    console.log(`WS: user ${userId} connected (${clients.size} total)`);

    socket.on('close', () => {
      // Only remove if this socket is still the registered one
      if (clients.get(userId) === socket) {
        clients.delete(userId);
      }
      console.log(`WS: user ${userId} disconnected (${clients.size} total)`);
    });

    socket.on('error', (err) => {
      console.error(`WS error for user ${userId}:`, err.message);
    });

    // Send a welcome ping so the client knows the connection is live
    socket.send(JSON.stringify({ type: 'CONNECTED', userId }));
  });

  return wss;
}

/**
 * Push a JSON payload to a connected user.
 * Silently ignores if the user is not connected.
 */
function broadcast(userId, payload) {
  const socket = clients.get(Number(userId));
  if (socket && socket.readyState === 1 /* OPEN */) {
    socket.send(JSON.stringify(payload));
  }
}

/**
 * Expose the client map for tests / introspection.
 */
function getClients() {
  return clients;
}

module.exports = { attachWebSocketServer, broadcast, getClients };
