const { register } = require('esbuild-register/dist/node')
const tsconfig = require('./tsconfig.server.json')
register({
  tsconfigRaw: tsconfig,
  target: tsconfig.compilerOptions.target,
})
require('./index.ts')
