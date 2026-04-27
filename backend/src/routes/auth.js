const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const { id, token } = await authService.register(username, password);
    return res.status(201).json({ id, token });
  } catch (err) {
    if (err.code === 'DUPLICATE_USERNAME') {
      return res.status(409).json({ error: err.message });
    }
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'ID_EXHAUSTED') {
      return res.status(503).json({ error: 'No IDs available; try again later' });
    }
    console.error('register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const { id, token } = await authService.login(username, password);
    return res.status(200).json({ id, token });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: err.message });
    }
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/guest
router.post('/guest', async (req, res) => {
  try {
    const { id, token } = await authService.createGuest();
    return res.status(200).json({ id, token });
  } catch (err) {
    if (err.code === 'ID_EXHAUSTED') {
      return res.status(503).json({ error: 'No guest IDs available; try again later' });
    }
    console.error('guest error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
