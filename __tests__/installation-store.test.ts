import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const InstallationStore = require('../installation-service/InstallationStore.cjs')

const createInstallQueue = require('../installation-service/createInstallQueue.cjs')

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
})
