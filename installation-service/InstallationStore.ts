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
  signal?: AbortSignal
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
  private readonly onInstallComplete: (
    outcome: 'success' | 'failure',
    durationSeconds: number,
  ) => void
  private closing = false
  private sweepTimer?: NodeJS.Timeout
  private sweepInProgress?: Promise<void>
  private readonly keyLocks = new Map<string, Promise<unknown>>()
  private readonly pending = new Map<
    string,
    {
      controller: AbortController
      signal: AbortSignal
      callers: Set<symbol>
    }
  >()
  private readonly failures = new Map<
    string,
    { error: Error; expires: number }
  >()

  constructor(
    installationApi: InstallationApi,
    {
      queue,
      rootPath = '/tmp/tmp-build/installations',
      retentionMs = 3 * 60_000,
      leaseMs = 15 * 60_000,
      onError = console.error,
      onInstallComplete = () => {},
    }: {
      queue: InstallQueue
      rootPath?: string
      retentionMs?: number
      leaseMs?: number
      onError?: (error: Error) => void
      onInstallComplete?: (
        outcome: 'success' | 'failure',
        durationSeconds: number,
      ) => void
    },
  ) {
    this.installationApi = installationApi
    this.queue = queue
    this.rootPath = rootPath
    this.retentionMs = retentionMs
    this.leaseMs = leaseMs
    this.onError = onError
    this.onInstallComplete = onInstallComplete
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

  // All build workers use this single daemon; cleanup shares its directory locks.
  async withDirectoryLock<T>(
    directory: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.keyLocks.get(directory) || Promise.resolve()
    const current = previous.catch(() => {}).then(task)
    this.keyLocks.set(directory, current)

    try {
      return await current
    } finally {
      if (this.keyLocks.get(directory) === current)
        this.keyLocks.delete(directory)
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
      options.signal?.throwIfAborted()

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

  private installationInterest(directory: string, options: InstallOptions) {
    let pending = this.pending.get(directory)

    if (!pending || pending.signal.aborted) {
      const controller = new AbortController()
      pending = {
        controller,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(options.installTimeout ?? 60_000),
        ]),
        callers: new Set(),
      }
      this.pending.set(directory, pending)
    }

    const caller = Symbol()
    pending.callers.add(caller)
    const shared = pending

    const leave = () => {
      shared.callers.delete(caller)

      if (shared.callers.size === 0) {
        shared.controller.abort()

        if (this.pending.get(directory) === shared)
          this.pending.delete(directory)
      }
    }

    return { sharedSignal: shared.signal, leave }
  }

  private retainFailure(key: string, error: Error) {
    this.failures.delete(key)

    const compact = Object.assign(
      new Error('Installation recently failed; retry in one minute'),
      {
        name: error.name,
        toJSON() {
          return {
            name: this.name,
            originalError: 'Installation recently failed; retry in one minute',
            extra: { retryable: true },
          }
        },
      },
    )

    this.failures.set(key, {
      error: compact,
      expires: Date.now() + 60_000,
    })

    if (this.failures.size > 2_000) {
      this.failures.delete(this.failures.keys().next().value!)
    }
  }

  private checkFailure(key: string, cached: Metadata | undefined) {
    const failure = this.failures.get(key)

    if (cached?.key !== key && failure && failure.expires > Date.now()) {
      throw failure.error
    }

    this.failures.delete(key)
  }

  async subscribe(
    exactPackageString: string,
    options: InstallOptions = {},
    signal?: AbortSignal,
  ) {
    if (this.closing) throw new Error('Installation service is closing')
    const key = this.key(exactPackageString, options)

    const directory = this.directory(key)

    signal?.throwIfAborted()

    const { sharedSignal, leave } = this.installationInterest(
      directory,
      options,
    )

    signal?.addEventListener('abort', leave, { once: true })

    const subscription = await this.withDirectoryLock(directory, async () => {
      signal?.throwIfAborted()
      const cached = await this.read(directory)

      this.checkFailure(key, cached)

      const installation =
        (cached?.key === key ? cached.installation : undefined) ??
        (await this.queue.run(async () => {
          signal?.throwIfAborted()

          // Queue wait and cached reuse are excluded from installation timing.
          const started = performance.now()

          // Count actual installs once, after publishing their metadata. Cache
          // hits and subscriptions sharing an installation do not count again.
          try {
            const installed = await this.install(key, exactPackageString, {
              ...options,
              signal: sharedSignal,
            })

            this.onInstallComplete(
              'success',
              (performance.now() - started) / 1000,
            )

            return installed
          } catch (error) {
            if (!sharedSignal.aborted && error instanceof Error) {
              // Keep physical failures even if the original HTTP caller is gone.
              // Bound both retention and cardinality; cancellations are not failures.
              this.retainFailure(key, error)
            }

            this.onInstallComplete(
              'failure',
              (performance.now() - started) / 1000,
            )
            throw error
          }
        }))

      const now = Date.now()

      const id = `${path.basename(directory)}-${randomUUID()}`

      const leases = {
        ...this.liveLeases(cached, now),
        [id]: now + this.leaseMs,
      }

      const entry = {
        key,
        installation,
        lastUsedAt: now,
        activeUntil: Math.max(...Object.values(leases)),
        leases,
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
    }).finally(() => {
      signal?.removeEventListener('abort', leave)
      leave()
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
      // Existing owners have no persisted IDs; retain only their original expiry.
      Object.entries(
        metadata?.leases ?? { unreleased: metadata?.activeUntil ?? 0 },
      ).filter(([, expiry]) => expiry > now),
    )
  }

  async unsubscribe(id: string): Promise<boolean> {
    const match = /^([a-f0-9]{24})-[a-f0-9-]{36}$/.exec(id)

    if (!match) return false

    const directory = path.join(this.rootPath, match[1])
    const metadata = await this.read(directory)

    if (!metadata) return false

    return this.withDirectoryLock(directory, async () => {
      const current = await this.read(directory)

      if (!current?.leases || !Object.hasOwn(current.leases, id)) return false

      const leases = this.liveLeases(current)
      delete leases[id]
      await this.write({
        ...current,
        leases,
        lastUsedAt: Date.now(),
        activeUntil: Math.max(0, ...Object.values(leases)),
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
      if (this.closing) break

      if (!entry.isDirectory()) continue

      const directory = path.join(this.rootPath, entry.name)
      await this.withDirectoryLock(directory, async () => {
        const current = await this.read(directory)

        if (!current) {
          await this.disposeDirectory(directory)

          return
        }

        const now = Date.now()

        if (
          (current.activeUntil || 0) > now ||
          current.lastUsedAt + this.retentionMs > now
        ) {
          return
        }

        await this.disposeDirectory(directory)
      }).catch(this.onError)
    }
  }

  private async disposeDirectory(directory: string): Promise<void> {
    // package-build-stats can log a deletion error and resolve without removing files.
    await this.installationApi.disposePackage({ installPath: directory })

    const remaining = await fs.lstat(directory).catch(error => {
      if (error.code !== 'ENOENT') throw error

      return undefined
    })

    if (remaining) {
      throw new Error(`Installation cleanup did not remove ${directory}`)
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
    this.closing = true
    clearInterval(this.sweepTimer)

    for (const pending of this.pending.values()) pending.controller.abort()
    await Promise.allSettled([
      ...this.keyLocks.values(),
      ...(this.sweepInProgress ? [this.sweepInProgress] : []),
    ])
  }
}

export default InstallationStore
