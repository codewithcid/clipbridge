const { verifyToken } = require('../services/auth.service');

/**
 * Express middleware that validates a Bearer JWT from the Authorization header.
 * On success, attaches req.userId (numeric).
 * On failure, responds 401.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.userId = Number(payload.sub);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authenticate;
