const PQueue = require('p-queue')

/** Caps concurrent installs; InstallationStore serializes requests for the same key. */
module.exports = function createInstallQueue(concurrency) {
  const queue = new PQueue({ concurrency })

  return {
    run: task => queue.add(task),
    diagnostics: () => ({ ready: queue.size, running: queue.pending }),
  }
}
