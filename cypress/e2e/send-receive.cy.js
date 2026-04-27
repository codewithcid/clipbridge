/**
 * E2E: Send between two sessions and verify real-time WebSocket delivery.
 *
 * Cypress runs two windows via cy.origin / cy.visit with separate sessions.
 * For simplicity we use cy.session to isolate the two users, then verify
 * inbox update within 2 seconds.
 */

const TS = Date.now();
const SENDER_NAME   = `sender_${TS}`;
const RECEIVER_NAME = `receiver_${TS}`;
const PASSWORD      = 'testpass1';
const MESSAGE_TEXT  = `WS delivery test ${TS}`;

describe('Send & Receive via WebSocket', () => {
  let senderId, receiverId, senderToken, receiverToken;

  before(() => {
    // Create both users via API
    cy.request('POST', '/api/auth/register', { username: SENDER_NAME, password: PASSWORD })
      .then((res) => { senderId = res.body.id; senderToken = res.body.token; });

    cy.request('POST', '/api/auth/register', { username: RECEIVER_NAME, password: PASSWORD })
      .then((res) => { receiverId = res.body.id; receiverToken = res.body.token; });
  });

  it('receiver inbox updates within 2 s after sender submits', () => {
    // ── Open the app as the RECEIVER ──────────────────────
    cy.visit('/');

    // Inject session so we don't have to fill the form
    cy.window().then((win) => {
      win.sessionStorage.setItem('cb_token',   receiverToken);
      win.sessionStorage.setItem('cb_userId',  String(receiverId));
      win.sessionStorage.setItem('cb_isGuest', 'false');
    });
    cy.reload();

    cy.get('#app', { timeout: 5000 }).should('not.have.class', 'hidden');
    cy.get('[data-panel="panel-receive"]').click();

    // Note the current inbox length
    cy.get('#inbox-list').then(($list) => {
      const initialCount = $list.find('.message-card').length;

      // ── Send a message as the SENDER via REST (no second browser needed) ──
      cy.request({
        method: 'POST',
        url: '/api/messages',
        headers: { Authorization: `Bearer ${senderToken}` },
        body: { to: receiverId, text: MESSAGE_TEXT },
      });

      // ── Verify the receiver's inbox updates within 2 s (WS push) ─────────
      cy.get('.message-card', { timeout: 2000 }).should('have.length.gte', initialCount + 1);
      cy.get('.message-text').should('contain', MESSAGE_TEXT);
    });
  });

  it('sender can see their message in the receiver\'s inbox via REST', () => {
    cy.request({
      method: 'GET',
      url: '/api/messages',
      headers: { Authorization: `Bearer ${receiverToken}` },
    }).then((res) => {
      expect(res.status).to.eq(200);
      const found = res.body.some((m) => m.text === MESSAGE_TEXT && m.from === senderId);
      expect(found).to.be.true;
    });
  });

  it('can copy a message to clipboard', () => {
    cy.visit('/');
    cy.window().then((win) => {
      win.sessionStorage.setItem('cb_token',   receiverToken);
      win.sessionStorage.setItem('cb_userId',  String(receiverId));
      win.sessionStorage.setItem('cb_isGuest', 'false');
    });
    cy.reload();

    cy.get('#app').should('not.have.class', 'hidden');
    cy.get('[data-panel="panel-receive"]').click();

    cy.get('.message-card', { timeout: 3000 }).should('exist');
    // Grant clipboard permission and click Copy
    cy.window().then((win) => {
      // Stub clipboard to avoid permission issues in headless
      cy.stub(win.navigator.clipboard, 'writeText').resolves();
    });
    cy.get('[data-copy]').first().click();
    cy.get('.toast').should('exist');
  });

  it('sender can send to themselves (self-send) via UI quick self-send', () => {
    cy.visit('/');
    cy.window().then((win) => {
      win.sessionStorage.setItem('cb_token',   senderToken);
      win.sessionStorage.setItem('cb_userId',  String(senderId));
      win.sessionStorage.setItem('cb_isGuest', 'false');
    });
    cy.reload();

    cy.get('#app').should('not.have.class', 'hidden');
    cy.get('[data-panel="panel-send"]').click();

    cy.get('#self-send-text').type('Self-send via quick box');
    cy.get('#btn-self-send').click();

    cy.get('.toast.success').should('exist');

    cy.get('[data-panel="panel-receive"]').click();
    cy.get('.message-card', { timeout: 3000 }).should('exist');
    cy.get('.message-text').should('contain', 'Self-send via quick box');
  });
});
