import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import InstallationStore from '../installation-service/InstallationStore.ts'

import createInstallQueue from '../installation-service/createInstallQueue.ts'

const roots: string[] = []

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'installation-store-'))
  roots.push(root)

  return root
}

function installationApi(root: string) {
  return {
    installPackage: jest.fn(async (packageString: string) => {
      const [packageName, packageVersion] = packageString.split('@')
      const installPath = await fs.mkdtemp(path.join(root, 'installed-'))
      const packagePath = path.join(installPath, 'node_modules', packageName)
      await fs.mkdir(packagePath, { recursive: true })

      return {
        packageString,
        packageName,
        packageVersion,
        installPath,
        packagePath,
      }
    }),
    disposePackage: jest.fn(async ({ installPath }) => {
      await fs.rm(installPath, { recursive: true, force: true })
    }),
  }
}

function createStore(
  api,
  rootPath,
  { retentionMs = 60_000, leaseMs = 60_000 } = {},
) {
  return new InstallationStore(api, {
    queue: createInstallQueue(2),
    rootPath,
    retentionMs,
    leaseMs,
  })
}

describe('installation service store', () => {
  afterEach(async () => {
    jest.useRealTimers()
    await Promise.all(
      roots
        .splice(0)
        .map(root => fs.rm(root, { recursive: true, force: true })),
    )
  })

  it('deduplicates concurrent requests for one exact package version', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root)
    await store.start()

    const [first, second] = await Promise.all([
      store.subscribe('lodash@4.17.21', { installTimeout: 30_000 }),
      store.subscribe('lodash@4.17.21', { installTimeout: 60_000 }),
    ])

    expect(api.installPackage).toHaveBeenCalledTimes(1)
    expect(first.installation.installPath).toBe(second.installation.installPath)
    expect(first.id).not.toBe(second.id)
    expect((await store.diagnostics()).installations).toEqual([
      expect.objectContaining({
        packageString: 'lodash@4.17.21',
        packageVersion: '4.17.21',
        activeSubscriptions: 2,
      }),
    ])
    await store.unsubscribe(first.id)
    await store.unsubscribe(second.id)
    await store.close()
  })

  it('restores completed installations after a service restart', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    const firstStore = createStore(api, root)
    await firstStore.start()
    const first = await firstStore.subscribe('date-fns@4.1.0')
    await firstStore.close()

    const restartedStore = createStore(api, root)
    await restartedStore.start()
    const restored = await restartedStore.subscribe('date-fns@4.1.0')

    expect(restored.installation.installPath).toBe(
      first.installation.installPath,
    )
    expect(api.installPackage).toHaveBeenCalledTimes(1)
    await restartedStore.unsubscribe(restored.id)
    await restartedStore.close()
  })

  it('checks the full key stored inside a deterministic directory', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root)
    store.directory = () => path.join(root, 'forced-collision')
    await store.start()

    const lodash = await store.subscribe('lodash@4.17.21')
    const react = await store.subscribe('react@19.1.1')

    expect(react.installation.packageString).toBe('react@19.1.1')
    expect(api.installPackage).toHaveBeenCalledTimes(2)
    await store.unsubscribe(lodash.id)
    await store.unsubscribe(react.id)
    await store.close()
  })

  it('removes installations after the restart-safe retention window', async () => {
    jest.useFakeTimers()
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root, { retentionMs: 1_000 })
    await store.start()
    const subscription = await store.subscribe('three@0.170.0')
    await store.unsubscribe(subscription.id)

    await jest.advanceTimersByTimeAsync(1_100)
    await store.sweep()

    expect((await store.diagnostics()).installations).toHaveLength(0)
    expect(api.disposePackage).toHaveBeenCalledWith({
      installPath: subscription.installation.installPath,
    })
    await store.close()
  })

  it('retains an installation while a subscription is active', async () => {
    jest.useFakeTimers()
    const root = await temporaryRoot()
    const api = installationApi(root)

    const store = createStore(api, root, {
      retentionMs: 1_000,
      leaseMs: 10_000,
    })

    await store.start()
    const subscription = await store.subscribe('react@19.1.1')

    await jest.advanceTimersByTimeAsync(2_000)
    await store.sweep()

    expect(api.disposePackage).not.toHaveBeenCalled()
    await store.unsubscribe(subscription.id)
    await store.close()
  })

  it('expires abandoned subscriptions', async () => {
    jest.useFakeTimers()
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root, { retentionMs: 1_000, leaseMs: 1_000 })
    await store.start()
    const subscription = await store.subscribe('react@19.1.1')

    await jest.advanceTimersByTimeAsync(2_100)
    await store.sweep()

    expect((await store.diagnostics()).installations).toHaveLength(0)
    expect(api.disposePackage).toHaveBeenCalledWith({
      installPath: subscription.installation.installPath,
    })
    await store.close()
  })

  it('removes incomplete directories when the service starts', async () => {
    const root = await temporaryRoot()
    const abandonedPath = await fs.mkdtemp(path.join(root, 'abandoned-'))
    const api = installationApi(root)
    const store = createStore(api, root, { retentionMs: 1_000 })
    await store.start()

    expect(api.disposePackage).toHaveBeenCalledWith({
      installPath: abandonedPath,
    })
    await store.close()
  })

  it('releases persisted owners after restart without removing another owner', async () => {
    jest.useFakeTimers()
    const root = await temporaryRoot()
    const api = installationApi(root)

    const first = createStore(api, root, {
      retentionMs: 1_000,
      leaseMs: 10_000,
    })

    const owner = await first.subscribe('react@19.1.1')
    const other = await first.subscribe('react@19.1.1')

    const restarted = createStore(api, root, {
      retentionMs: 1_000,
      leaseMs: 10_000,
    })

    expect(await restarted.unsubscribe(owner.id)).toBe(true)
    await jest.advanceTimersByTimeAsync(2_000)
    await restarted.sweep()
    expect((await restarted.diagnostics()).subscriptions).toBe(1)
    expect(api.disposePackage).not.toHaveBeenCalled()
    expect(await restarted.unsubscribe(other.id)).toBe(true)
    await jest.advanceTimersByTimeAsync(1_100)
    await restarted.sweep()
    expect(await fs.readdir(root)).toEqual([])
  })

  it('preserves pre-upgrade leases when a new owner releases', async () => {
    jest.useFakeTimers()
    const root = await temporaryRoot()
    const api = installationApi(root)

    const store = createStore(api, root, {
      retentionMs: 1_000,
      leaseMs: 10_000,
    })

    const original = await store.subscribe('react@19.1.1')
    const metadata = await store.read(original.installation.installPath)
    delete metadata!.leases
    await store.write(metadata!)

    const restarted = createStore(api, root, {
      retentionMs: 1_000,
      leaseMs: 10_000,
    })

    const current = await restarted.subscribe('react@19.1.1')
    await restarted.unsubscribe(current.id)
    await jest.advanceTimersByTimeAsync(2_000)
    await restarted.sweep()
    expect(api.disposePackage).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(8_100)
    await restarted.sweep()
    expect(await fs.readdir(root)).toEqual([])
  })

  it('skips cancelled queued installs and releases a cancelled running result', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    let finish!: () => void
    let start!: () => void

    const started = new Promise<void>(resolve => {
      start = resolve
    })

    const gate = new Promise<void>(resolve => {
      finish = resolve
    })

    const install = api.installPackage.getMockImplementation()!
    api.installPackage.mockImplementation(async packageString => {
      start()
      await gate

      return install(packageString)
    })

    const store = new InstallationStore(api, {
      rootPath: root,
      queue: createInstallQueue(1),
    })

    const running = new AbortController()
    const queued = new AbortController()
    const first = store.subscribe('react@19.1.1', {}, running.signal)
    await started
    const second = store.subscribe('lodash@4.17.21', {}, queued.signal)
    const results = Promise.allSettled([first, second])
    running.abort()
    queued.abort()
    finish()

    expect((await results).every(result => result.status === 'rejected')).toBe(
      true,
    )
    expect(api.installPackage).toHaveBeenCalledTimes(1)
    expect((await store.diagnostics()).subscriptions).toBe(0)

    const metadata = await store.read(
      store.directory(store.key('react@19.1.1', {})),
    )

    expect(metadata?.activeUntil).toBe(0)
  })

  it.each(['expired', 'missing metadata'])(
    'waits for %s cleanup before reinstalling the same package',
    async state => {
      const root = await temporaryRoot()
      const api = installationApi(root)
      const store = createStore(api, root)
      const directory = store.directory(store.key('react@19.1.1', {}))

      if (state === 'expired') {
        const previous = await store.subscribe('react@19.1.1')
        await store.unsubscribe(previous.id)
        const metadata = await store.read(directory)
        await store.write({ ...metadata!, lastUsedAt: 0 })
        api.installPackage.mockClear()
      } else {
        // An interrupted publication left no metadata. This path must still lock.
        await fs.mkdir(directory)
      }

      let finish!: () => void
      let started!: () => void

      const deleting = new Promise<void>(resolve => {
        started = resolve
      })

      const gate = new Promise<void>(resolve => {
        finish = resolve
      })

      const dispose = api.disposePackage.getMockImplementation()!
      api.disposePackage.mockImplementation(async installation => {
        started()
        await gate
        await dispose(installation)
      })
      const sweep = store.sweep()
      await deleting
      const subscribing = store.subscribe('react@19.1.1')

      try {
        await new Promise(resolve => setImmediate(resolve))
        expect(api.installPackage).not.toHaveBeenCalled()
      } finally {
        finish()
        await sweep
      }

      const owner = await subscribing
      await store.sweep()
      expect((await store.read(directory))?.leases).toHaveProperty(owner.id)
      expect(api.installPackage).toHaveBeenCalledTimes(1)
      expect(api.disposePackage).toHaveBeenCalledTimes(1)
      await store.unsubscribe(owner.id)
    },
  )

  it('serializes disposal and joins overlapping cleanup sweeps', async () => {
    const root = await temporaryRoot()
    await fs.mkdir(path.join(root, 'first'))
    await fs.mkdir(path.join(root, 'second'))
    const api = installationApi(root)
    let releaseDeletion!: () => void
    let deletionStarted!: () => void

    const started = new Promise<void>(resolve => {
      deletionStarted = resolve
    })

    const gate = new Promise<void>(resolve => {
      releaseDeletion = resolve
    })

    const dispose = api.disposePackage.getMockImplementation()!
    let activeDeletions = 0
    let peakDeletions = 0
    api.disposePackage.mockImplementation(async installation => {
      activeDeletions += 1
      peakDeletions = Math.max(peakDeletions, activeDeletions)
      deletionStarted()
      await gate
      await dispose(installation)
      activeDeletions -= 1
    })
    const store = createStore(api, root)
    const sweeps = [store.sweep(), store.sweep()]

    try {
      await started
      expect(api.disposePackage).toHaveBeenCalledTimes(1)
    } finally {
      releaseDeletion()
      await Promise.all(sweeps)
    }

    expect(api.disposePackage).toHaveBeenCalledTimes(2)
    expect(peakDeletions).toBe(1)
    expect(await fs.readdir(root)).toEqual([])
  })
})
