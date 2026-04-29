/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: './tests/setup.js',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',  // entry point – not unit-testable
    '!src/ws.js',      // WebSocket server – requires live WS connections; covered by E2E
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  testTimeout: 15000,
};
