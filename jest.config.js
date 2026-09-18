module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { target: 'es2022' } }],
  },
  moduleNameMapper: {
    '\\.(svg)$': '<rootDir>/__tests__/fixtures/svgMock.js',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}
