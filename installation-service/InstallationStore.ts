import { createHash, randomUUID } from 'node:crypto'

import fs from 'node:fs/promises'

import path from 'node:path'

import { z } from 'zod'

const METADATA_FILE = '.bundlephobia-installation.json'

const metadataSchema = z.object({
  key: z.string(),
  lastUsedAt: z.number(),
  activeUntil: z.number().optional(),
  leases: z.record(z.string(), z.number()).optional(),
  legacyActiveUntil: z.number().optional(),
  installation: z
    .object({
      packageVersion: z.string(),
      installPath: z.string(),
      packagePath: z.string(),
    })
    .passthrough(),
})

type Metadata = z.infer<typeof metadataSchema>

type Installation = Metadata['installation']

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

export interface InstallOptions {
  client?: PackageManager | PackageManager[]
  additionalPackages?: string[]
  installTimeout?: number
  limitConcurrency?: boolean
  networkConcurrency?: number
  debug?: boolean
  isLocal?: boolean
}

export interface InstallationApi {
  installPackage(
    packageString: string,
    options: InstallOptions,
  ): Promise<Installation>
  disposePackage(installation: { installPath: string }): Promise<void>
}

export interface InstallQueue {
  run<T>(task: () => Promise<T>): Promise<T>
  diagnostics(): { ready: number; running: number }
}

class InstallationStore {
  private readonly installationApi: InstallationApi
  private readonly queue: InstallQueue
  private readonly rootPath: string
  private readonly retentionMs: number
  private readonly leaseMs: number
  private readonly onError: (error: Error) => void
  private sweepTimer?: NodeJS.Timeout
  private sweepInProgress?: Promise<void>
  private readonly keyLocks = new Map<string, Promise<unknown>>()

  constructor(
    installationApi: InstallationApi,
    {
      queue,
      rootPath = '/tmp/tmp-build/installations',
      retentionMs = 5 * 60_000,
      leaseMs = 15 * 60_000,
      onError = console.error,
    }: {
      queue: InstallQueue
      rootPath?: string
      retentionMs?: number
      leaseMs?: number
      onError?: (error: Error) => void
    },
  ) {
    this.installationApi = installationApi
    this.queue = queue
    this.rootPath = rootPath
    this.retentionMs = retentionMs
    this.leaseMs = leaseMs
    this.onError = onError
  }

  key(exactPackageString: string, options: InstallOptions): string {
    return JSON.stringify([
      exactPackageString,
      options.client,
      options.additionalPackages,
      process.platform,
      process.arch,
      process.versions.node.split('.')[0],
    ])
  }

  directory(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 24)

    return path.join(this.rootPath, hash)
  }

  async withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.keyLocks.get(key) || Promise.resolve()
    const current = previous.catch(() => {}).then(task)
    this.keyLocks.set(key, current)

    try {
      return await current
    } finally {
      if (this.keyLocks.get(key) === current) this.keyLocks.delete(key)
    }
  }

  async read(directory: string): Promise<Metadata | undefined> {
    try {
      const metadata = metadataSchema.parse(
        JSON.parse(
          await fs.readFile(path.join(directory, METADATA_FILE), 'utf8'),
        ),
      )

      const { installation } = metadata

      if (
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

  async write(
    entry: Metadata,
    location = entry.installation.installPath,
  ): Promise<void> {
    const metadataPath = path.join(location, METADATA_FILE)

    const temporaryPath = `${metadataPath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(entry))
    await fs.rename(temporaryPath, metadataPath)
  }

  async install(
    key: string,
    exactPackageString: string,
    options: InstallOptions,
  ): Promise<Installation> {
    const installed = await this.installationApi.installPackage(
      exactPackageString,
      options,
    )

    const directory = this.directory(key)

    const relativePackagePath = path.relative(
      installed.installPath,
      installed.packagePath,
    )

    if (relativePackagePath.startsWith('..')) {
      await this.installationApi.disposePackage(installed)
      throw new Error('Installed package path is outside its installation')
    }

    try {
      const installation = {
        ...installed,
        installPath: directory,
        packagePath: path.join(directory, relativePackagePath),
      }

      const now = Date.now()

      // Publish complete metadata with the directory so a sweep cannot see
      // a half-installed entry between rename and the first subscription.
      await this.write(
        { key, installation, lastUsedAt: now, activeUntil: now + this.leaseMs },
        installed.installPath,
      )
      await fs.rm(directory, { recursive: true, force: true })
      await fs.rename(installed.installPath, directory)

      return installation
    } catch (error) {
      await this.installationApi.disposePackage(installed)
      throw error
    }
  }

  async subscribe(
    exactPackageString: string,
    options: InstallOptions = {},
    signal?: AbortSignal,
  ) {
    const key = this.key(exactPackageString, options)

    const subscription = await this.withKeyLock(key, async () => {
      signal?.throwIfAborted()
      const directory = this.directory(key)
      const cached = await this.read(directory)

      const installation =
        (cached?.key === key ? cached.installation : undefined) ??
        (await this.queue.run(() => {
          signal?.throwIfAborted()

          return this.install(key, exactPackageString, options)
        }))

      const now = Date.now()

      const id = `${path.basename(directory)}-${randomUUID()}`

      const leases = {
        ...this.liveLeases(cached, now),
        [id]: now + this.leaseMs,
      }

      // Preserve pre-upgrade owners whose opaque IDs were never persisted.
      const legacyActiveUntil = this.legacyLeaseUntil(cached)

      const entry = {
        key,
        installation,
        lastUsedAt: now,
        activeUntil: Math.max(legacyActiveUntil, ...Object.values(leases)),
        leases,
        legacyActiveUntil,
      }

      try {
        await this.write(entry)
      } catch (error) {
        if (cached?.key !== key) {
          await this.installationApi.disposePackage(installation)
        }

        throw error
      }

      return { id, installation }
    })

    if (signal) {
      const release = () => {
        void this.unsubscribe(subscription.id).catch(this.onError)
      }

      signal.addEventListener('abort', release, { once: true })

      if (signal.aborted) {
        signal.removeEventListener('abort', release)
        await this.unsubscribe(subscription.id).catch(this.onError)
        signal.throwIfAborted()
      }
    }

    return subscription
  }

  private liveLeases(metadata: Metadata | undefined, now = Date.now()) {
    return Object.fromEntries(
      Object.entries(metadata?.leases || {}).filter(
        ([, expiry]) => expiry > now,
      ),
    )
  }

  private legacyLeaseUntil(metadata: Metadata | undefined): number {
    return (
      metadata?.legacyActiveUntil ??
      (metadata && !metadata.leases ? metadata.activeUntil || 0 : 0)
    )
  }

  async unsubscribe(id: string): Promise<boolean> {
    const match = /^([a-f0-9]{24})-[a-f0-9-]{36}$/.exec(id)

    if (!match) return false

    const directory = path.join(this.rootPath, match[1])
    const metadata = await this.read(directory)

    if (!metadata) return false

    return this.withKeyLock(metadata.key, async () => {
      const current = await this.read(directory)

      if (!current?.leases || !Object.hasOwn(current.leases, id)) return false

      const leases = this.liveLeases(current)
      delete leases[id]
      await this.write({
        ...current,
        leases,
        lastUsedAt: Date.now(),
        activeUntil: Math.max(
          current.legacyActiveUntil || 0,
          0,
          ...Object.values(leases),
        ),
      })

      return true
    })
  }

  async entries(): Promise<(Metadata | undefined)[]> {
    return Promise.all(
      (await fs.readdir(this.rootPath, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => this.read(path.join(this.rootPath, entry.name))),
    )
  }

  sweep(): Promise<void> {
    this.sweepInProgress ??= this.sweepDirectories().finally(() => {
      this.sweepInProgress = undefined
    })

    return this.sweepInProgress
  }

  private async sweepDirectories(): Promise<void> {
    const directories = await fs.readdir(this.rootPath, { withFileTypes: true })

    // Recursive deletion can allocate heavily; process one workspace at a time.
    for (const entry of directories) {
      if (!entry.isDirectory()) continue

      const directory = path.join(this.rootPath, entry.name)
      const metadata = await this.read(directory)

      if (!metadata) {
        await this.installationApi.disposePackage({ installPath: directory })

        continue
      }

      await this.withKeyLock(metadata.key, async () => {
        const current = await this.read(directory)

        if (!current) return

        const now = Date.now()

        if (
          (current.activeUntil || 0) > now ||
          current.lastUsedAt + this.retentionMs > now
        ) {
          return
        }

        await this.installationApi.disposePackage({ installPath: directory })
      })
    }
  }

  async start(): Promise<void> {
    await fs.mkdir(this.rootPath, { recursive: true })
    await this.sweep()
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch(error =>
        this.onError(error instanceof Error ? error : new Error(String(error))),
      )
    }, this.retentionMs)
    this.sweepTimer.unref?.()
  }

  async diagnostics() {
    const entries = (await this.entries()).filter((entry): entry is Metadata =>
      Boolean(entry),
    )

    return {
      queue: this.queue.diagnostics(),
      subscriptions: entries.reduce(
        (sum, entry) => sum + Object.keys(this.liveLeases(entry)).length,
        0,
      ),
      installations: entries.map(entry => ({
        packageString: entry.installation.packageString,
        packageVersion: entry.installation.packageVersion,
        activeSubscriptions: Object.keys(this.liveLeases(entry)).length,
        lastUsedAt: entry.lastUsedAt,
      })),
    }
  }

  async close(): Promise<void> {
    clearInterval(this.sweepTimer)
  }
}

export default InstallationStore
