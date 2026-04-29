/**
 * E2E: Guest access flow
 * - Visit site → auth modal appears
 * - Click "Guest" → get a 4-digit ID in 5000-9999
 * - Self-send a message
 * - Verify it appears in the Receive tab
 */

describe('Guest access', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows the auth modal on first visit', () => {
    cy.get('#auth-overlay').should('be.visible');
    cy.get('.modal-brand').should('contain', 'ClipBridge');
  });

  it('switches between auth tabs', () => {
    cy.get('[data-tab="register"]').click();
    cy.get('#tab-register').should('be.visible');
    cy.get('#tab-login').should('not.be.visible');

    cy.get('[data-tab="guest"]').click();
    cy.get('#tab-guest').should('be.visible');
  });

  it('assigns a guest ID in 5000–9999 and enters the app', () => {
    cy.get('[data-tab="guest"]').click();
    cy.get('#btn-guest').click();

    // Auth overlay hides, app appears
    cy.get('#auth-overlay').should('have.class', 'hidden');
    cy.get('#app').should('not.have.class', 'hidden');

    // ID is in guest range
    cy.get('#topbar-id-number').invoke('text').then((idText) => {
      const id = parseInt(idText, 10);
      expect(id).to.be.gte(5000);
      expect(id).to.be.lte(9999);
    });

    // Mode badge shows "Guest"
    cy.get('#mode-badge').should('contain', 'Guest');
  });

  it('self-sends a message and it appears in the inbox', () => {
    // Sign in as guest
    cy.get('[data-tab="guest"]').click();
    cy.get('#btn-guest').click();
    cy.get('#app').should('not.have.class', 'hidden');

    // Get own ID
    cy.get('#topbar-id-number').invoke('text').then((idText) => {
      const myId = parseInt(idText, 10);

      // Navigate to Send tab
      cy.get('[data-panel="panel-send"]').click();
      cy.get('#send-to').clear().type(String(myId));
      cy.get('#send-text').type('Hello from guest self-send!');
      cy.get('#btn-send').click();

      // Toast confirmation
      cy.get('.toast.success').should('exist');

      // Navigate to Receive tab
      cy.get('[data-panel="panel-receive"]').click();

      // Message card should appear
      cy.get('.message-card', { timeout: 5000 }).should('have.length.gte', 1);
      cy.get('.message-text').should('contain', 'Hello from guest self-send!');
    });
  });

  it('can dismiss a message from the inbox', () => {
    cy.get('[data-tab="guest"]').click();
    cy.get('#btn-guest').click();
    cy.get('#app').should('not.have.class', 'hidden');

    cy.get('#topbar-id-number').invoke('text').then((idText) => {
      const myId = parseInt(idText, 10);

      cy.get('[data-panel="panel-send"]').click();
      cy.get('#send-to').clear().type(String(myId));
      cy.get('#send-text').type('To be dismissed');
      cy.get('#btn-send').click();

      cy.get('[data-panel="panel-receive"]').click();
      cy.get('.message-card', { timeout: 5000 }).should('exist');

      cy.get('[data-dismiss]').first().click();

      // Card removed
      cy.get('.empty-state').should('exist');
    });
  });

  it('quick self-send saves to inbox', () => {
    cy.get('[data-tab="guest"]').click();
    cy.get('#btn-guest').click();

    cy.get('[data-panel="panel-send"]').click();
    cy.get('#self-send-text').type('Quick note to self');
    cy.get('#btn-self-send').click();

    cy.get('.toast.success').should('exist');

    cy.get('[data-panel="panel-receive"]').click();
    cy.get('.message-card', { timeout: 5000 }).should('exist');
    cy.get('.message-text').should('contain', 'Quick note to self');
  });
});
