const { randomUUID } = require('node:crypto')

class InstallationStore {
  constructor(
    installationApi,
    {
      queue,
      idleMs = 5_000,
      leaseMs = 5 * 60_000,
      onError = console.error,
    } = {}
  ) {
    this.installationApi = installationApi
    this.idleMs = idleMs
    this.leaseMs = leaseMs
    this.onError = onError
    this.queue = queue
    this.installations = new Map()
    this.leases = new Map()
  }

  key(packageString, options) {
    return JSON.stringify([
      packageString,
      options.client,
      options.limitConcurrency,
      options.networkConcurrency,
      options.additionalPackages,
      options.installTimeout,
      process.platform,
      process.arch,
      process.versions.node.split('.')[0],
    ])
  }

  async getInstallation(packageString, options) {
    const key = this.key(packageString, options)
    const cached = this.installations.get(key)
    if (cached) return cached

    return this.queue.run(key, async () => {
      const concurrentlyCached = this.installations.get(key)
      if (concurrentlyCached) return concurrentlyCached

      const installation = await this.installationApi.installPackage(
        packageString,
        options
      )
      const canonicalKey = this.key(
        `${installation.packageName}@${installation.packageVersion}`,
        options
      )
      const keys = new Set([key, canonicalKey])
      const entry = { keys, installation, leases: 0, cleanupTimer: undefined }
      for (const installationKey of keys) {
        if (!this.installations.has(installationKey)) {
          this.installations.set(installationKey, entry)
        }
      }
      return entry
    })
  }

  cancelCleanup(entry) {
    if (!entry.cleanupTimer) return
    clearTimeout(entry.cleanupTimer)
    entry.cleanupTimer = undefined
  }

  scheduleCleanup(entry) {
    this.cancelCleanup(entry)
    if (entry.leases > 0) return

    entry.cleanupTimer = setTimeout(() => {
      if (entry.leases > 0) return
      for (const key of entry.keys) {
        if (this.installations.get(key) === entry)
          this.installations.delete(key)
      }
      void this.installationApi
        .disposePackage(entry.installation)
        .catch(this.onError)
    }, this.idleMs)
    entry.cleanupTimer.unref()
  }

  async acquire(packageString, options = {}) {
    const entry = await this.getInstallation(packageString, options)
    this.cancelCleanup(entry)
    entry.leases += 1

    let workspace
    try {
      workspace = await this.installationApi.createPackageWorkspace(
        entry.installation
      )
    } catch (error) {
      entry.leases -= 1
      this.scheduleCleanup(entry)
      throw error
    }

    const id = randomUUID()
    const expiryTimer = setTimeout(() => {
      void this.release(id).catch(this.onError)
    }, this.leaseMs)
    expiryTimer.unref()
    this.leases.set(id, { entry, workspace, expiryTimer })

    return { id, ...workspace }
  }

  async release(id) {
    const lease = this.leases.get(id)
    if (!lease) return false

    this.leases.delete(id)
    clearTimeout(lease.expiryTimer)
    try {
      await this.installationApi.disposePackage(lease.workspace)
    } finally {
      lease.entry.leases -= 1
      this.scheduleCleanup(lease.entry)
    }
    return true
  }

  diagnostics() {
    const installations = [...new Set(this.installations.values())]
    return {
      queue: this.queue.diagnostics(),
      installations: installations.map(entry => ({
        packageString: entry.installation.packageString,
        packageName: entry.installation.packageName,
        packageVersion: entry.installation.packageVersion,
        leases: entry.leases,
      })),
      leases: this.leases.size,
    }
  }

  async close() {
    await Promise.all([...this.leases.keys()].map(id => this.release(id)))
    const installations = [...new Set(this.installations.values())]
    this.installations.clear()
    await Promise.all(
      installations.map(entry => {
        this.cancelCleanup(entry)
        return this.installationApi.disposePackage(entry.installation)
      })
    )
  }
}

module.exports = InstallationStore
