module.exports = {
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    'server/**/*.js',
    'browser/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/dist/**',
    '!**/build/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  moduleDirectories: ['node_modules', '<rootDir>'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
}; 