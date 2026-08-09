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

function createStore(api, rootPath, retentionMs = 60_000) {
  return new InstallationStore(api, {
    queue: createInstallQueue(2),
    rootPath,
    retentionMs,
  })
}

describe('installation service store', () => {
  afterEach(async () => {
    jest.useRealTimers()
    await Promise.all(
      roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))
    )
  })

  it('deduplicates concurrent requests for one exact package version', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root)
    await store.start()

    const [first, second] = await Promise.all([
      store.get('lodash@4.17.21', { installTimeout: 30_000 }),
      store.get('lodash@4.17.21', { installTimeout: 60_000 }),
    ])

    expect(api.installPackage).toHaveBeenCalledTimes(1)
    expect(first.installPath).toBe(second.installPath)
    expect((await store.diagnostics()).installations).toEqual([
      expect.objectContaining({
        packageString: 'lodash@4.17.21',
        packageVersion: '4.17.21',
      }),
    ])
    await store.close()
  })

  it('restores completed installations after a service restart', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    const firstStore = createStore(api, root)
    await firstStore.start()
    const first = await firstStore.get('date-fns@4.1.0')
    await firstStore.close()

    const restartedStore = createStore(api, root)
    await restartedStore.start()
    const restored = await restartedStore.get('date-fns@4.1.0')

    expect(restored.installPath).toBe(first.installPath)
    expect(api.installPackage).toHaveBeenCalledTimes(1)
    await restartedStore.close()
  })

  it('checks the full key stored inside a deterministic directory', async () => {
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root)
    store.directory = () => path.join(root, 'forced-collision')
    await store.start()

    await store.get('lodash@4.17.21')
    const react = await store.get('react@19.1.1')

    expect(react.packageString).toBe('react@19.1.1')
    expect(api.installPackage).toHaveBeenCalledTimes(2)
    await store.close()
  })

  it('removes installations after the restart-safe retention window', async () => {
    jest.useFakeTimers()
    const root = await temporaryRoot()
    const api = installationApi(root)
    const store = createStore(api, root, 1_000)
    await store.start()
    const installed = await store.get('three@0.170.0')

    await jest.advanceTimersByTimeAsync(1_100)
    await store.sweep()

    expect((await store.diagnostics()).installations).toHaveLength(0)
    expect(api.disposePackage).toHaveBeenCalledWith({
      installPath: installed.installPath,
    })
    await store.close()
  })

  it('removes incomplete directories when the service starts', async () => {
    const root = await temporaryRoot()
    const abandonedPath = await fs.mkdtemp(path.join(root, 'abandoned-'))
    const api = installationApi(root)
    const store = createStore(api, root, 1_000)
    await store.start()

    expect(api.disposePackage).toHaveBeenCalledWith({
      installPath: abandonedPath,
    })
    await store.close()
  })
})
