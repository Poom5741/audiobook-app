// Jest configuration for Auth Service
const sharedConfig = require('../shared/jest.config.js');

module.exports = {
  ...sharedConfig,
  
  // Service-specific configuration
  displayName: 'Auth Service',
  rootDir: '.',
  
  // Test setup - mocks need to be in setupFiles, hooks in setupFilesAfterEnv
  setupFiles: [
    './src/test/setup.js'
  ],
  setupFilesAfterEnv: [
    '../shared/test-setup.js'
  ],
  
  // Coverage configuration specific to auth service
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/test/**',
    '!src/**/*.test.{js,ts}',
    '!src/**/*.spec.{js,ts}',
    '!src/index.js' // Exclude main entry point from coverage
  ],
  
  // Lower coverage thresholds initially for auth service
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Test environment for auth service
  testEnvironment: 'node',
  
  // Module mapping for mocks
  moduleNameMapper: {
    '^../../../../shared/secrets-loader$': '<rootDir>/src/test/__mocks__/secrets-loader.js'
  },
  
  // Specific timeout for auth tests (they involve crypto operations)
  testTimeout: 15000
};