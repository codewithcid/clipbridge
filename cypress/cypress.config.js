const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'https://clipbridge-5q1p.onrender.com',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 8000,
    // Give WebSocket messages time to arrive
    pageLoadTimeout: 15000,
    setupNodeEvents(on, config) {
      return config;
    },
  },
});
