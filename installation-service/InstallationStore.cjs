const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const METADATA_FILE = '.bundlephobia-installation.json'

class InstallationStore {
  constructor(
    installationApi,
    {
      queue,
      rootPath = '/tmp/tmp-build/installations',
      retentionMs = 20 * 60_000,
      onError = console.error,
    } = {}
  ) {
    this.installationApi = installationApi
    this.queue = queue
    this.rootPath = rootPath
    this.retentionMs = retentionMs
    this.onError = onError
    this.sweepTimer = undefined
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

  async read(directory) {
    try {
      const metadata = JSON.parse(
        await fs.readFile(path.join(directory, METADATA_FILE), 'utf8')
      )
      const installation = metadata?.installation
      if (
        typeof metadata?.key !== 'string' ||
        typeof metadata.lastUsedAt !== 'number' ||
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

  async get(exactPackageString, options = {}) {
    const key = this.key(exactPackageString, options)
    return this.queue.run(key, async () => {
      const directory = this.directory(key)
      const cached = await this.read(directory)
      const installation =
        (cached?.key === key ? cached.installation : undefined) ??
        (await this.install(key, exactPackageString, options))
      const entry = { key, installation, lastUsedAt: Date.now() }
      try {
        await this.write(entry)
        return installation
      } catch (error) {
        if (cached?.key !== key) {
          await this.installationApi.disposePackage(installation)
        }
        throw error
      }
    })
  }

  async entries() {
    const directories = await fs.readdir(this.rootPath, { withFileTypes: true })
    return Promise.all(
      directories
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
          if (
            !metadata ||
            metadata.lastUsedAt + this.retentionMs <= Date.now()
          ) {
            await this.installationApi.disposePackage({
              installPath: directory,
            })
          }
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
      installations: entries.map(entry => ({
        packageString: entry.installation.packageString,
        packageVersion: entry.installation.packageVersion,
        lastUsedAt: entry.lastUsedAt,
      })),
    }
  }

  async close() {
    clearInterval(this.sweepTimer)
  }
}

module.exports = InstallationStore
