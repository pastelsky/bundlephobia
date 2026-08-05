const InstallationStore = require('../installation-service/InstallationStore.cjs')

type Installation = {
  packageString: string
  packageName: string
  packageVersion: string
  installPath: string
  packagePath: string
}

function installation(
  packageString: string,
  installPath: string,
  packageVersion = '1.0.0'
): Installation {
  return {
    packageString,
    packageName: packageString.split('@')[0],
    packageVersion,
    installPath,
    packagePath: `${installPath}/node_modules/${packageString}`,
  }
}

describe('installation service store', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('deduplicates installs while giving concurrent analyses separate workspaces', async () => {
    let workspaceNumber = 0
    const installationApi = {
      installPackage: jest.fn(async packageString =>
        installation(packageString, `/installed/${packageString}`)
      ),
      createPackageWorkspace: jest.fn(async installed =>
        installation(installed.packageString, `/workspace/${++workspaceNumber}`)
      ),
      disposePackage: jest.fn(async () => undefined),
    }
    const store = new InstallationStore(installationApi, { idleMs: 60_000 })

    const [first, second] = await Promise.all([
      store.acquire('lodash'),
      store.acquire('lodash'),
    ])

    expect(installationApi.installPackage).toHaveBeenCalledTimes(1)
    expect(installationApi.createPackageWorkspace).toHaveBeenCalledTimes(2)
    expect(first.installPath).not.toBe(second.installPath)
    expect(store.diagnostics()).toMatchObject({
      installations: [{ packageString: 'lodash', leases: 2 }],
      leases: 2,
    })

    await store.release(first.id)
    await store.release(second.id)
    await store.close()
  })

  it('reuses an idle installation for the next results-page request', async () => {
    jest.useFakeTimers()
    let workspaceNumber = 0
    const installationApi = {
      installPackage: jest.fn(async packageString =>
        installation(packageString, `/installed/${packageString}`)
      ),
      createPackageWorkspace: jest.fn(async installed =>
        installation(installed.packageString, `/workspace/${++workspaceNumber}`)
      ),
      disposePackage: jest.fn(async () => undefined),
    }
    const store = new InstallationStore(installationApi, { idleMs: 1_000 })

    const first = await store.acquire('date-fns')
    await store.release(first.id)
    await jest.advanceTimersByTimeAsync(500)
    const second = await store.acquire('date-fns@1.0.0')

    expect(installationApi.installPackage).toHaveBeenCalledTimes(1)
    expect(second.installPath).not.toBe(first.installPath)

    await store.release(second.id)
    await jest.advanceTimersByTimeAsync(1_000)
    expect(store.diagnostics().installations).toHaveLength(0)
    expect(installationApi.disposePackage).toHaveBeenCalledTimes(3)
    await store.close()
  })

  it('expires abandoned workspace leases', async () => {
    jest.useFakeTimers()
    const installationApi = {
      installPackage: jest.fn(async packageString =>
        installation(packageString, `/installed/${packageString}`)
      ),
      createPackageWorkspace: jest.fn(async installed =>
        installation(installed.packageString, '/workspace/abandoned')
      ),
      disposePackage: jest.fn(async () => undefined),
    }
    const store = new InstallationStore(installationApi, {
      idleMs: 1_000,
      leaseMs: 500,
    })

    await store.acquire('three')
    await jest.advanceTimersByTimeAsync(500)

    expect(store.diagnostics().leases).toBe(0)
    expect(installationApi.disposePackage).toHaveBeenCalledWith(
      expect.objectContaining({ installPath: '/workspace/abandoned' })
    )
    await store.close()
  })
})
