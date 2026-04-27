/* ═══════════════════════════════════════════════════════════
   ClipBridge – frontend application
   Vanilla JS, no framework.
═══════════════════════════════════════════════════════════ */

const API = '/api';

// ── State ────────────────────────────────────────────────
let state = {
  token: null,
  userId: null,
  isGuest: false,
  ws: null,
  sendHistory: [],   // [{ to, preview, ts }]
  inbox: [],
};

// ── Session persistence ──────────────────────────────────
function saveSession(userId, token, isGuest) {
  state.token   = token;
  state.userId  = userId;
  state.isGuest = isGuest;
  sessionStorage.setItem('cb_token',   token);
  sessionStorage.setItem('cb_userId',  String(userId));
  sessionStorage.setItem('cb_isGuest', String(isGuest));
}

function loadSession() {
  const token   = sessionStorage.getItem('cb_token');
  const userId  = Number(sessionStorage.getItem('cb_userId'));
  const isGuest = sessionStorage.getItem('cb_isGuest') === 'true';
  if (token && userId) {
    state.token   = token;
    state.userId  = userId;
    state.isGuest = isGuest;
    return true;
  }
  return false;
}

function clearSession() {
  state = { token: null, userId: null, isGuest: false, ws: null, sendHistory: [], inbox: [] };
  sessionStorage.clear();
}

// ── API helpers ──────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// ── Toast notifications ──────────────────────────────────
function toast(message, type = 'info', durationMs = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out .2s ease forwards';
    setTimeout(() => el.remove(), 200);
  }, durationMs);
}

// ── Auth modal – tab switcher ────────────────────────────
function initAuthTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ── Auth flows ───────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  const { ok, data } = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username, password },
  });

  if (!ok) { errEl.textContent = data?.error || 'Login failed'; return; }
  saveSession(data.id, data.token, false);
  enterApp();
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  errEl.textContent = '';

  const { ok, data } = await apiFetch('/auth/register', {
    method: 'POST',
    body: { username, password },
  });

  if (!ok) { errEl.textContent = data?.error || 'Registration failed'; return; }
  saveSession(data.id, data.token, false);
  enterApp();
});

document.getElementById('btn-guest').addEventListener('click', async () => {
  const errEl = document.getElementById('guest-error');
  errEl.textContent = '';

  const { ok, data } = await apiFetch('/auth/guest', { method: 'POST' });
  if (!ok) { errEl.textContent = data?.error || 'Could not create guest session'; return; }
  saveSession(data.id, data.token, true);
  enterApp();
});

// ── App entry / exit ─────────────────────────────────────
function enterApp() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Show user ID
  document.getElementById('topbar-id-number').textContent = state.userId;
  document.getElementById('account-id-display').textContent = state.userId;

  // Mode badge
  const badge = document.getElementById('mode-badge');
  if (state.isGuest) {
    badge.textContent = 'Guest';
    badge.className = 'mode-badge guest';
  } else {
    badge.textContent = 'Member';
    badge.className = 'mode-badge member';
  }

  connectWebSocket();
  loadInbox();
}

document.getElementById('btn-signout').addEventListener('click', () => {
  if (state.ws) state.ws.close();
  clearSession();
  location.reload();
});

// ── Main tab switching ───────────────────────────────────
function initMainTabs() {
  document.querySelectorAll('.main-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.main-tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(btn.dataset.panel).classList.remove('hidden');

      // Clear inbox badge when navigating to receive
      if (btn.dataset.panel === 'panel-receive') {
        updateInboxBadge(0);
      }
    });
  });
}

// ── WebSocket ────────────────────────────────────────────
function connectWebSocket() {
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl   = `${wsProto}://${location.host}?token=${state.token}`;

  const dot = document.getElementById('ws-indicator');
  dot.className = 'ws-dot ws-connecting';

  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.addEventListener('open', () => {
    dot.className = 'ws-dot ws-connected';
    dot.title = 'Connected – real-time updates active';
  });

  ws.addEventListener('close', () => {
    dot.className = 'ws-dot ws-disconnected';
    dot.title = 'Disconnected';
    // Reconnect after 3 seconds if still logged in
    if (state.token) setTimeout(connectWebSocket, 3000);
  });

  ws.addEventListener('error', () => {
    dot.className = 'ws-dot ws-disconnected';
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'NEW_MESSAGE') {
        prependMessageToInbox(msg.message);
        toast(`New message from #${msg.message.from}`, 'success');
      }
    } catch {
      // ignore non-JSON frames
    }
  });
}

// ── Inbox ────────────────────────────────────────────────
async function loadInbox() {
  const { ok, data } = await apiFetch('/messages');
  if (!ok) { toast('Failed to load inbox', 'error'); return; }

  state.inbox = data;
  renderInbox();
}

function renderInbox() {
  const list  = document.getElementById('inbox-list');
  const count = document.getElementById('inbox-count');

  if (!state.inbox.length) {
    list.innerHTML = '<p class="empty-state">No messages yet — share your ID to receive clips.</p>';
    count.textContent = '';
    return;
  }

  count.textContent = `(${state.inbox.length})`;
  list.innerHTML = state.inbox.map(renderCard).join('');

  // Bind buttons
  list.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy)
        .then(() => toast('Copied to clipboard!', 'success'))
        .catch(() => toast('Copy failed – use Ctrl+C', 'error'));
    });
  });

  list.querySelectorAll('[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', () => dismissMessage(Number(btn.dataset.dismiss)));
  });
}

function renderCard(msg) {
  const ts = new Date(msg.ts).toLocaleString();
  const escaped = escapeHtml(msg.text);
  return `
    <div class="message-card" data-msg-id="${msg.id}">
      <div class="message-meta">
        <span class="message-from">From #${msg.from}</span>
        <span>${ts}</span>
      </div>
      <pre class="message-text">${escaped}</pre>
      <div class="message-actions">
        <button class="btn btn-icon" data-copy="${escapeAttr(msg.text)}">Copy</button>
        <button class="btn btn-icon" data-dismiss="${msg.id}">Dismiss</button>
      </div>
    </div>`;
}

function prependMessageToInbox(msg) {
  state.inbox.unshift(msg);
  renderInbox();

  // If not on receive tab, show badge
  const receiveBtn = document.querySelector('[data-panel="panel-receive"]');
  if (!receiveBtn.classList.contains('active')) {
    const current = parseInt(document.getElementById('inbox-badge').textContent || '0', 10);
    updateInboxBadge(current + 1);
  }
}

function updateInboxBadge(count) {
  const badge = document.getElementById('inbox-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function dismissMessage(id) {
  const { ok } = await apiFetch(`/messages/${id}`, { method: 'DELETE' });
  if (!ok) { toast('Could not dismiss message', 'error'); return; }

  state.inbox = state.inbox.filter((m) => m.id !== id);
  renderInbox();
  toast('Message dismissed', 'info', 1500);
}

// ── Send tab ─────────────────────────────────────────────
const sendToInput   = document.getElementById('send-to');
const sendTextInput = document.getElementById('send-text');
const recipientHint = document.getElementById('recipient-hint');
const charCountEl   = document.getElementById('char-count');

sendTextInput.addEventListener('input', () => {
  charCountEl.textContent = `${sendTextInput.value.length} / 10000`;
});

// Live recipient look-up (debounced)
let recipientTimer = null;
sendToInput.addEventListener('input', () => {
  clearTimeout(recipientTimer);
  const val = sendToInput.value.trim();
  if (val.length < 4) { recipientHint.textContent = ''; recipientHint.className = 'hint-line'; return; }
  recipientTimer = setTimeout(() => lookupRecipient(val), 400);
});

async function lookupRecipient(id) {
  // We don't have a dedicated /users/:id endpoint, so we attempt a dummy send
  // and check the error.  A cleaner approach uses the fact that we have the
  // messages endpoint: try to send an empty string and inspect the 400 vs 404.
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1000 || num > 9999) {
    recipientHint.textContent = 'ID must be 1000–9999';
    recipientHint.className = 'hint-line not-found';
    return;
  }

  // Simple existence probe: POST with empty text deliberately triggers 400
  // (validation) for existing recipients, 404 for non-existent ones.
  const { status } = await apiFetch('/messages', {
    method: 'POST',
    body: { to: num, text: '' },
  });

  if (status === 400) {
    // Recipient exists (got a validation error about the text, not 404)
    recipientHint.textContent = `✓ Recipient #${num} found`;
    recipientHint.className = 'hint-line found';
  } else if (status === 404) {
    recipientHint.textContent = `✗ No user with ID #${num}`;
    recipientHint.className = 'hint-line not-found';
  } else {
    recipientHint.textContent = '';
    recipientHint.className = 'hint-line';
  }
}

document.getElementById('form-send').addEventListener('submit', async (e) => {
  e.preventDefault();
  const to   = Number(sendToInput.value);
  const text = sendTextInput.value;

  if (!to || !text.trim()) {
    toast('Please fill in both the recipient ID and message', 'error');
    return;
  }

  const btn = document.getElementById('btn-send');
  btn.disabled = true;

  const { ok, data } = await apiFetch('/messages', {
    method: 'POST',
    body: { to, text },
  });

  btn.disabled = false;

  if (!ok) {
    toast(data?.error || 'Failed to send', 'error');
    return;
  }

  toast(`Sent to #${to}!`, 'success');
  sendTextInput.value = '';
  charCountEl.textContent = '0 / 10000';
  recipientHint.textContent = '';
  recipientHint.className = 'hint-line';

  addSendHistory(to, text);

  // If we sent to ourselves, refresh inbox
  if (to === state.userId) loadInbox();
});

// ── Self-send ────────────────────────────────────────────
document.getElementById('btn-self-send').addEventListener('click', async () => {
  const text = document.getElementById('self-send-text').value;
  if (!text.trim()) { toast('Nothing to save', 'error'); return; }

  const { ok, data } = await apiFetch('/messages', {
    method: 'POST',
    body: { to: state.userId, text },
  });

  if (!ok) { toast(data?.error || 'Failed to save', 'error'); return; }

  document.getElementById('self-send-text').value = '';
  toast('Saved to your inbox!', 'success');
  loadInbox();
});

// ── Send history (account tab) ───────────────────────────
function addSendHistory(to, text) {
  state.sendHistory.unshift({ to, preview: text.slice(0, 60), ts: new Date().toLocaleTimeString() });
  if (state.sendHistory.length > 20) state.sendHistory.pop();
  renderSendHistory();
}

function renderSendHistory() {
  const list = document.getElementById('send-history');
  if (!state.sendHistory.length) {
    list.innerHTML = '<li class="empty-state">Nothing sent yet.</li>';
    return;
  }
  list.innerHTML = state.sendHistory.map((h) => `
    <li class="history-item">
      <span class="history-to">→ #${h.to}</span>
      <span class="history-preview">${escapeHtml(h.preview)}</span>
      <span class="history-ts">${h.ts}</span>
    </li>`).join('');
}

// ── Escape helpers ───────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Bootstrap ────────────────────────────────────────────
function init() {
  initAuthTabs();
  initMainTabs();

  if (loadSession()) {
    enterApp();
  }
}

init();
