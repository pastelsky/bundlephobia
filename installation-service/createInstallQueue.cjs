const { register } = require('esbuild-register/dist/node')
const tsconfig = require('../tsconfig.server.json')

register({
  tsconfigRaw: tsconfig,
  target: tsconfig.compilerOptions.target,
})
const Queue = require('../server/Queue').default

/** Reuses the main-service queue for package/options keyed installation tasks. */
module.exports = function createInstallQueue(concurrency) {
  const queue = new Queue({ concurrency, aging: false })
  queue.addExecutor('install-package', ({ task }) => task())

  return {
    run: (key, task) =>
      queue.process(key, 'install-package', {
        task,
      }),
    diagnostics: () => queue.getDiagnostics(),
  }
}
