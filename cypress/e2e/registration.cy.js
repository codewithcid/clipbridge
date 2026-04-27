/**
 * E2E: Registration and login flow
 * - Register a new user → permanent ID assigned
 * - Sign out → sign back in → same ID
 * - Duplicate username rejected
 */

const UNIQUE = Date.now(); // keep usernames unique per test run

describe('Registration', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('registers a new user and receives a member ID (1000–4999)', () => {
    cy.get('[data-tab="register"]').click();
    cy.get('#reg-username').type(`user_${UNIQUE}`);
    cy.get('#reg-password').type('pass1234');
    cy.get('#form-register button[type="submit"]').click();

    cy.get('#app').should('not.have.class', 'hidden');

    cy.get('#topbar-id-number').invoke('text').then((idText) => {
      const id = parseInt(idText, 10);
      expect(id).to.be.gte(1000);
      expect(id).to.be.lte(4999);
    });

    cy.get('#mode-badge').should('contain', 'Member');
  });

  it('shows an error for a duplicate username', () => {
    const dupName = `dup_${UNIQUE}`;

    // First registration
    cy.get('[data-tab="register"]').click();
    cy.get('#reg-username').type(dupName);
    cy.get('#reg-password').type('pass1234');
    cy.get('#form-register button[type="submit"]').click();
    cy.get('#app').should('not.have.class', 'hidden');

    // Sign out
    cy.get('[data-panel="panel-account"]').click();
    cy.get('#btn-signout').click();
    cy.get('#auth-overlay').should('be.visible');

    // Second attempt with same name
    cy.get('[data-tab="register"]').click();
    cy.get('#reg-username').type(dupName);
    cy.get('#reg-password').type('pass5678');
    cy.get('#form-register button[type="submit"]').click();

    cy.get('#reg-error').should('not.be.empty');
    cy.get('#auth-overlay').should('be.visible');
  });

  it('shows an error for a password shorter than 6 characters', () => {
    cy.get('[data-tab="register"]').click();
    cy.get('#reg-username').type(`short_${UNIQUE}`);
    cy.get('#reg-password').type('abc');
    cy.get('#form-register button[type="submit"]').click();

    cy.get('#reg-error').should('not.be.empty');
  });
});

describe('Login', () => {
  const username = `login_${UNIQUE}`;
  const password = 'securepass';
  let savedId;

  before(() => {
    // Register once via the API so we have a user to log in with
    cy.request('POST', '/api/auth/register', { username, password }).then((res) => {
      savedId = res.body.id;
    });
  });

  beforeEach(() => {
    cy.visit('/');
  });

  it('logs in with correct credentials and gets the same ID', () => {
    cy.get('#login-username').type(username);
    cy.get('#login-password').type(password);
    cy.get('#form-login button[type="submit"]').click();

    cy.get('#app').should('not.have.class', 'hidden');

    cy.get('#topbar-id-number').invoke('text').then((idText) => {
      expect(parseInt(idText, 10)).to.eq(savedId);
    });
  });

  it('shows an error for a wrong password', () => {
    cy.get('#login-username').type(username);
    cy.get('#login-password').type('wrongpass');
    cy.get('#form-login button[type="submit"]').click();

    cy.get('#login-error').should('not.be.empty');
    cy.get('#auth-overlay').should('be.visible');
  });

  it('ID persists after sign-out and re-login', () => {
    // Login
    cy.get('#login-username').type(username);
    cy.get('#login-password').type(password);
    cy.get('#form-login button[type="submit"]').click();
    cy.get('#app').should('not.have.class', 'hidden');

    // Sign out
    cy.get('[data-panel="panel-account"]').click();
    cy.get('#btn-signout').click();
    cy.get('#auth-overlay').should('be.visible');

    // Login again
    cy.get('#login-username').type(username);
    cy.get('#login-password').type(password);
    cy.get('#form-login button[type="submit"]').click();

    // Same ID
    cy.get('#topbar-id-number').invoke('text').then((idText) => {
      expect(parseInt(idText, 10)).to.eq(savedId);
    });
  });
});
