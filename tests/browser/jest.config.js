const path = require('path');

module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: [path.join(__dirname, '../setup.js')],
  testTimeout: 10000,
  transform: {
    '^.+\\.js$': ['babel-jest', {
      configFile: path.join(__dirname, '../../browser/.babelrc')
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(ws|bufferutil|utf-8-validate)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  moduleDirectories: ['node_modules', path.join(__dirname, '../../')]
}; 