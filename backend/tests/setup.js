/**
 * Jest globalSetup – runs once before all test suites.
 *
 * Auto-loads backend/.env so `npm test` works without manually exporting vars.
 * If env vars are already set (e.g. from CI), they take precedence.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = async function globalSetup() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-clipbridge';
  process.env.NODE_ENV = 'test';
};
