const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const messageService = require('../services/message.service');
// ws module is attached to the app in server.js; access via req.app
const { broadcast } = require('../ws');

// All message routes require a valid JWT
router.use(authenticate);

// POST /api/messages  { to, text }
router.post('/', async (req, res) => {
  const { to, text } = req.body;

  if (to === undefined || to === null) {
    return res.status(400).json({ error: '"to" field is required' });
  }
  if (!text) {
    return res.status(400).json({ error: '"text" field is required' });
  }

  try {
    const message = await messageService.sendMessage(req.userId, to, text);

    // Push real-time notification to the recipient if they're connected
    broadcast(message.to, {
      type: 'NEW_MESSAGE',
      message,
    });

    return res.status(201).json(message);
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    console.error('sendMessage error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/messages  → inbox for current user
router.get('/', async (req, res) => {
  try {
    const messages = await messageService.getInbox(req.userId);
    return res.status(200).json(messages);
  } catch (err) {
    console.error('getInbox error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/messages/:id
router.delete('/:id', async (req, res) => {
  const messageId = parseInt(req.params.id, 10);

  if (isNaN(messageId)) {
    return res.status(400).json({ error: 'Message ID must be a number' });
  }

  try {
    const deleted = await messageService.deleteMessage(messageId, req.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('deleteMessage error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
