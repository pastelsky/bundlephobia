import type { PackageBuildInfo } from '../types/package-domain'
import type { CacheKey } from '../utils/cache.utils'
import type { RequestedPackage, ResolvedPackageState } from '../server/types'
import { createRequestedPackage } from '../server/services/packageResolution.service'
import {
  PackageSizeService,
  type PackageBuildAbortSignal,
  type PackageSizeBuild,
} from '../server/services/packageSize.service'

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

const buildResult: PackageSizeBuild = {
  size: 6500,
  gzip: 2600,
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: true,
  hasJSNext: false,
  isModuleType: false,
}

function createService() {
  const getCachedPackageSize = jest.fn<
    Promise<PackageBuildInfo | undefined>,
    [CacheKey]
  >()
  const setCachedPackageSize = jest.fn<
    Promise<void>,
    [CacheKey, PackageBuildInfo]
  >()
  const resolveRequestedPackage = jest.fn<
    Promise<ResolvedPackageState>,
    [RequestedPackage]
  >()
  const build = jest.fn<Promise<PackageSizeBuild>, [string, number]>()
  const cancel = jest.fn<void, [string]>()
  const service = new PackageSizeService({
    cache: {
      get: getCachedPackageSize,
      set: setCachedPackageSize,
    },
    resolvePackage: resolveRequestedPackage,
    builder: {
      build,
      cancel,
    },
  })

  return {
    service,
    getCachedPackageSize,
    setCachedPackageSize,
    resolveRequestedPackage,
    build,
    cancel,
  }
}

describe('PackageSizeService', () => {
  it('answers exact-version cache hits without consulting npm', async () => {
    const { service, getCachedPackageSize, resolveRequestedPackage, build } =
      createService()
    getCachedPackageSize.mockResolvedValue(cachedResult)

    await expect(
      service.lookupPackageSize(createRequestedPackage('react@18.2.0'))
    ).resolves.toEqual({
      kind: 'cache-hit',
      result: cachedResult,
      resolved: expect.objectContaining({ packageString: 'react@18.2.0' }),
    })
    expect(resolveRequestedPackage).not.toHaveBeenCalled()
    expect(build).not.toHaveBeenCalled()
  })

  it('returns an explicit cache miss without invoking the builder', async () => {
    const { service, getCachedPackageSize, resolveRequestedPackage, build } =
      createService()
    getCachedPackageSize.mockResolvedValue(undefined)
    resolveRequestedPackage.mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      scoped: false,
      packageString: 'react@18.2.0',
      description: 'React',
      repository: 'https://github.com/facebook/react.git',
    })

    await expect(
      service.lookupPackageSize(createRequestedPackage('react@18.2.0'))
    ).resolves.toEqual({
      kind: 'cache-miss',
      resolved: expect.objectContaining({ packageString: 'react@18.2.0' }),
    })
    expect(getCachedPackageSize).toHaveBeenCalledTimes(1)
    expect(build).not.toHaveBeenCalled()
  })

  it('builds and caches only when the caller explicitly requests a build', async () => {
    const {
      service,
      getCachedPackageSize,
      setCachedPackageSize,
      resolveRequestedPackage,
      build,
    } = createService()
    getCachedPackageSize.mockResolvedValue(undefined)
    resolveRequestedPackage.mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      scoped: false,
      packageString: 'react@18.2.0',
      description: 'React',
      repository: 'https://github.com/facebook/react.git',
    })
    build.mockResolvedValue(buildResult)

    const lookup = await service.lookupPackageSize(
      createRequestedPackage('react')
    )
    expect(lookup.kind).toBe('cache-miss')
    if (lookup.kind !== 'cache-miss') throw new Error('Expected cache miss')

    await service.buildPackageSize(lookup.resolved, 7)

    expect(build).toHaveBeenCalledWith('react@18.2.0', 7)
    expect(setCachedPackageSize).toHaveBeenCalledWith(
      { name: 'react', version: '18.2.0' },
      expect.objectContaining({
        name: 'react',
        version: '18.2.0',
        repository: 'https://github.com/facebook/react.git',
      })
    )
  })

  it('uses an explicit cache policy for forced builds', async () => {
    const { service, getCachedPackageSize, resolveRequestedPackage } =
      createService()
    resolveRequestedPackage.mockResolvedValue({
      name: 'react',
      version: '18.2.0',
      scoped: false,
      packageString: 'react@18.2.0',
      description: 'React',
      repository: '',
    })

    await service.lookupPackageSize(
      createRequestedPackage('react@18.2.0'),
      'bypass'
    )

    expect(getCachedPackageSize).not.toHaveBeenCalled()
    expect(resolveRequestedPackage).toHaveBeenCalledWith(
      createRequestedPackage('react@18.2.0')
    )
  })

  it('propagates request aborts to the active package build', async () => {
    const { service, build, cancel } = createService()
    let abortListener: (() => void) | undefined
    const signal: PackageBuildAbortSignal = {
      aborted: false,
      addEventListener: (_type, listener) => {
        abortListener = listener
      },
      removeEventListener: () => {
        abortListener = undefined
      },
    }
    let finishBuild: ((value: PackageSizeBuild) => void) | undefined
    build.mockReturnValue(
      new Promise(resolve => {
        finishBuild = resolve
      })
    )

    const buildPromise = service.buildPackageSize(
      {
        name: 'react',
        version: '18.2.0',
        scoped: false,
        description: 'React',
        repository: '',
        packageString: 'react@18.2.0',
      },
      7,
      signal
    )

    await Promise.resolve()
    abortListener?.()
    expect(cancel).toHaveBeenCalledWith('react@18.2.0')

    finishBuild?.(buildResult)
    await buildPromise
  })
})
