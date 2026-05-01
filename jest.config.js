module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { target: 'es2022' } }],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}
