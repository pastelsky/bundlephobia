import type { CacheKey } from '../utils/cache.utils'
import type { PackageBuildInfo } from '../types/package-domain'
import { PackageCacheMode } from '../utils/packageApi.utils'
import type { PackageRequest, ResolvedPackage } from '../server/types'
import { createPackageRequest } from '../server/services/packageResolution.service'
import { lookupPackageSize } from '../server/middlewares/results/packageSize.middleware'

const cachedResult: PackageBuildInfo = {
  name: 'react',
  version: '18.2.0',
  description: 'React',
  repository: 'https://github.com/facebook/react',
  size: 6500,
  gzip: 2600,
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: true,
  hasJSNext: false,
  isModuleType: false,
}

const resolvedReact: ResolvedPackage = {
  name: 'react',
  version: '18.2.0',
  scoped: false,
  packageString: 'react@18.2.0',
  description: 'React',
  repository: 'https://github.com/facebook/react.git',
}

function createDeps() {
  const getPackageSize = jest.fn<
    Promise<PackageBuildInfo | undefined>,
    [CacheKey]
  >()
  const resolvePackage = jest.fn<Promise<ResolvedPackage>, [PackageRequest]>()
  return { cache: { getPackageSize }, getPackageSize, resolvePackage }
}

describe('lookupPackageSize', () => {
  it('serves an exactly-pinned cached size without contacting npm', async () => {
    const { cache, getPackageSize, resolvePackage } = createDeps()
    getPackageSize.mockResolvedValue(cachedResult)
    resolvePackage.mockRejectedValue(new Error('npm unavailable'))

    await expect(
      lookupPackageSize(createPackageRequest('react@18.2.0'), {
        cache,
        resolvePackage,
      })
    ).resolves.toEqual({
      resolvedPackage: expect.objectContaining({
        packageString: 'react@18.2.0',
      }),
      cachedResult,
    })
    expect(resolvePackage).not.toHaveBeenCalled()
  })

  it('resolves through npm, then reads the cache by resolved version', async () => {
    const { cache, getPackageSize, resolvePackage } = createDeps()
    // A range has no exact fast path: resolve first, then a single cache read.
    getPackageSize.mockResolvedValue(cachedResult)
    resolvePackage.mockResolvedValue(resolvedReact)

    await expect(
      lookupPackageSize(createPackageRequest('react@^18'), {
        cache,
        resolvePackage,
      })
    ).resolves.toEqual({ resolvedPackage: resolvedReact, cachedResult })
    expect(resolvePackage).toHaveBeenCalledTimes(1)
    expect(getPackageSize).toHaveBeenCalledTimes(1)
    expect(getPackageSize).toHaveBeenCalledWith({
      name: 'react',
      version: '18.2.0',
    })
  })

  it('skips every cache read and resolves fresh on force-rebuild', async () => {
    const { cache, getPackageSize, resolvePackage } = createDeps()
    getPackageSize.mockResolvedValue(cachedResult)
    resolvePackage.mockResolvedValue({
      ...resolvedReact,
      version: '19.0.0',
      packageString: 'react@19.0.0',
    })

    await expect(
      lookupPackageSize(
        createPackageRequest('react@18.2.0', PackageCacheMode.ForceRebuild),
        { cache, resolvePackage }
      )
    ).resolves.toEqual({
      resolvedPackage: expect.objectContaining({ version: '19.0.0' }),
    })
    expect(getPackageSize).not.toHaveBeenCalled()
  })
})
