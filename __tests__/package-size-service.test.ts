import type { PackageBuildInfo } from '../types/package-domain'
import type { CacheKey } from '../utils/cache.utils'
import type { PackageRequest, ResolvedPackage } from '../server/types'
import { createPackageRequest } from '../server/services/packageResolution.service'
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
  const resolvePackageRequest = jest.fn<
    Promise<ResolvedPackage>,
    [PackageRequest]
  >()
  const build = jest.fn<Promise<PackageSizeBuild>, [string, number]>()
  const cancel = jest.fn<void, [string]>()
  const service = new PackageSizeService({
    cache: {
      get: getCachedPackageSize,
      set: setCachedPackageSize,
    },
    resolvePackage: resolvePackageRequest,
    builder: {
      build,
      cancel,
    },
  })

  return {
    service,
    getCachedPackageSize,
    resolvePackageRequest,
    build,
    cancel,
  }
}

describe('PackageSizeService', () => {
  it('returns an exact cached package when npm is unavailable', async () => {
    const { service, getCachedPackageSize, resolvePackageRequest } =
      createService()
    getCachedPackageSize.mockResolvedValue(cachedResult)
    resolvePackageRequest.mockRejectedValue(new Error('npm unavailable'))

    await expect(
      service.findPackageSize(createPackageRequest('react@18.2.0'))
    ).resolves.toEqual({
      kind: 'cache-hit',
      result: cachedResult,
      resolvedPackage: expect.objectContaining({
        packageString: 'react@18.2.0',
      }),
    })
  })

  it('returns a complete package size after a build', async () => {
    const { service, build } = createService()
    const resolvedPackage: ResolvedPackage = {
      name: 'react',
      version: '18.2.0',
      scoped: false,
      packageString: 'react@18.2.0',
      description: 'React',
      repository: 'https://github.com/facebook/react.git',
    }
    build.mockResolvedValue(buildResult)

    await expect(service.buildPackageSize(resolvedPackage, 7)).resolves.toEqual(
      {
        ...buildResult,
        scoped: false,
        name: 'react',
        version: '18.2.0',
        description: 'React',
        repository: 'https://github.com/facebook/react.git',
      }
    )
  })

  it('keeps missing package metadata nullable after a build', async () => {
    const { service, build } = createService()
    build.mockResolvedValue(buildResult)

    await expect(
      service.buildPackageSize(
        {
          name: 'example',
          version: '1.0.0',
          scoped: false,
          packageString: 'example@1.0.0',
          description: null,
          repository: null,
        },
        7
      )
    ).resolves.toEqual(
      expect.objectContaining({ description: null, repository: null })
    )
  })

  it('refreshes package resolution instead of returning cached size data', async () => {
    const { service, getCachedPackageSize, resolvePackageRequest } =
      createService()
    getCachedPackageSize.mockResolvedValue(cachedResult)
    resolvePackageRequest.mockResolvedValue({
      name: 'react',
      version: '19.0.0',
      scoped: false,
      packageString: 'react@19.0.0',
      description: null,
      repository: null,
    })

    await expect(
      service.findPackageSize(createPackageRequest('react@18.2.0', 'refresh'))
    ).resolves.toEqual({
      kind: 'cache-miss',
      resolvedPackage: expect.objectContaining({ version: '19.0.0' }),
    })
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
        repository: null,
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
