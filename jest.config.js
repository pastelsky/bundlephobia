module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { target: 'es2022' } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!d3-|internmap)'],
  moduleNameMapper: {
    '^client/(.*)$': '<rootDir>/client/$1',
    '^utils$': '<rootDir>/utils/index.ts',
    '^utils/(.*)$': '<rootDir>/utils/$1',
    '\\.(svg)$': '<rootDir>/__tests__/fixtures/svgMock.js',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}
