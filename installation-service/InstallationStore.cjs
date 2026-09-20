const { createHash, randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const METADATA_FILE = '.bundlephobia-installation.json'

class InstallationStore {
  constructor(
    installationApi,
    {
      queue,
      rootPath = '/tmp/tmp-build/installations',
      retentionMs = 5 * 60_000,
      leaseMs = 10 * 60_000,
      onError = console.error,
    } = {}
  ) {
    this.installationApi = installationApi
    this.queue = queue
    this.rootPath = rootPath
    this.retentionMs = retentionMs
    this.leaseMs = leaseMs
    this.onError = onError
    this.sweepTimer = undefined
    this.keyLocks = new Map()
    this.subscriptions = new Map()
    this.activeCounts = new Map()
  }

  key(exactPackageString, options) {
    return JSON.stringify([
      exactPackageString,
      options.client,
      options.additionalPackages,
      process.platform,
      process.arch,
      process.versions.node.split('.')[0],
    ])
  }

  directory(key) {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 24)
    return path.join(this.rootPath, hash)
  }

  async withKeyLock(key, task) {
    const previous = this.keyLocks.get(key) || Promise.resolve()
    const current = previous.catch(() => {}).then(task)
    this.keyLocks.set(key, current)
    try {
      return await current
    } finally {
      if (this.keyLocks.get(key) === current) this.keyLocks.delete(key)
    }
  }

  async read(directory) {
    try {
      const metadata = JSON.parse(
        await fs.readFile(path.join(directory, METADATA_FILE), 'utf8')
      )
      const installation = metadata?.installation
      if (
        typeof metadata?.key !== 'string' ||
        typeof metadata.lastUsedAt !== 'number' ||
        (metadata.activeUntil !== undefined &&
          typeof metadata.activeUntil !== 'number') ||
        typeof installation?.packageVersion !== 'string' ||
        path.resolve(installation.installPath) !== path.resolve(directory) ||
        !path
          .resolve(installation.packagePath)
          .startsWith(`${path.resolve(directory)}${path.sep}`)
      ) {
        return undefined
      }
      return metadata
    } catch {
      return undefined
    }
  }

  async write(entry) {
    const metadataPath = path.join(
      entry.installation.installPath,
      METADATA_FILE
    )
    const temporaryPath = `${metadataPath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(entry))
    await fs.rename(temporaryPath, metadataPath)
  }

  async install(key, exactPackageString, options) {
    const installed = await this.installationApi.installPackage(
      exactPackageString,
      options
    )
    const directory = this.directory(key)
    const relativePackagePath = path.relative(
      installed.installPath,
      installed.packagePath
    )
    if (relativePackagePath.startsWith('..')) {
      await this.installationApi.disposePackage(installed)
      throw new Error('Installed package path is outside its installation')
    }

    try {
      await fs.rm(directory, { recursive: true, force: true })
      await fs.rename(installed.installPath, directory)
      return {
        ...installed,
        installPath: directory,
        packagePath: path.join(directory, relativePackagePath),
      }
    } catch (error) {
      await this.installationApi.disposePackage(installed)
      throw error
    }
  }

  async subscribe(exactPackageString, options = {}) {
    const key = this.key(exactPackageString, options)
    return this.withKeyLock(key, async () => {
      const directory = this.directory(key)
      const cached = await this.read(directory)
      const installation =
        (cached?.key === key ? cached.installation : undefined) ??
        (await this.queue.run(key, () =>
          this.install(key, exactPackageString, options)
        ))
      const now = Date.now()
      const entry = {
        key,
        installation,
        lastUsedAt: now,
        activeUntil: now + this.leaseMs,
      }

      try {
        await this.write(entry)
      } catch (error) {
        if (cached?.key !== key) {
          await this.installationApi.disposePackage(installation)
        }
        throw error
      }

      const id = randomUUID()
      this.subscriptions.set(id, { id, key, directory })
      this.activeCounts.set(
        directory,
        (this.activeCounts.get(directory) || 0) + 1
      )
      return { id, installation }
    })
  }

  async unsubscribe(id) {
    const subscription = this.subscriptions.get(id)
    if (!subscription) return false

    return this.withKeyLock(subscription.key, async () => {
      if (!this.subscriptions.delete(id)) return false

      const activeCount =
        (this.activeCounts.get(subscription.directory) || 1) - 1
      if (activeCount > 0) {
        this.activeCounts.set(subscription.directory, activeCount)
        return true
      }
      this.activeCounts.delete(subscription.directory)

      const metadata = await this.read(subscription.directory)
      if (metadata?.key === subscription.key) {
        await this.write({
          ...metadata,
          lastUsedAt: Date.now(),
          activeUntil: 0,
        })
      }
      return true
    })
  }

  async entries() {
    return Promise.all(
      (await fs.readdir(this.rootPath, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => this.read(path.join(this.rootPath, entry.name)))
    )
  }

  async sweep() {
    const directories = await fs.readdir(this.rootPath, { withFileTypes: true })
    await Promise.all(
      directories
        .filter(entry => entry.isDirectory())
        .map(async entry => {
          const directory = path.join(this.rootPath, entry.name)
          const metadata = await this.read(directory)
          if (!metadata) {
            await this.installationApi.disposePackage({
              installPath: directory,
            })
            return
          }

          await this.withKeyLock(metadata.key, async () => {
            const current = await this.read(directory)
            if (!current || this.activeCounts.get(directory)) return
            if (
              (current.activeUntil || 0) > Date.now() ||
              current.lastUsedAt + this.retentionMs > Date.now()
            ) {
              return
            }
            await this.installationApi.disposePackage({
              installPath: directory,
            })
          })
        })
    )
  }

  async start() {
    await fs.mkdir(this.rootPath, { recursive: true })
    await this.sweep()
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch(this.onError)
    }, this.retentionMs)
    this.sweepTimer.unref?.()
  }

  async diagnostics() {
    const entries = (await this.entries()).filter(Boolean)
    return {
      queue: this.queue.diagnostics(),
      subscriptions: this.subscriptions.size,
      installations: entries.map(entry => ({
        packageString: entry.installation.packageString,
        packageVersion: entry.installation.packageVersion,
        activeSubscriptions:
          this.activeCounts.get(entry.installation.installPath) || 0,
        lastUsedAt: entry.lastUsedAt,
      })),
    }
  }

  async close() {
    clearInterval(this.sweepTimer)
  }
}

module.exports = InstallationStore
