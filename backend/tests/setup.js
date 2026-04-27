/**
 * Jest globalSetup – runs once before all test suites.
 *
 * For unit tests the database is fully mocked, so this file just ensures the
 * JWT_SECRET env var is available.  Integration tests that need a real DB
 * should set DATABASE_URL themselves (or via a .env.test file).
 */
module.exports = async function globalSetup() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-clipbridge';
  process.env.NODE_ENV = 'test';
};
