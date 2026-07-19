import type { PackageBuildInfo, PackageIdentity } from '../types/package-domain'
import { PackageCacheMode } from '../utils/packageApi.utils'
import type { PackageRequest, ResolvedPackage } from '../server/types'
import { createPackageRequest } from '../server/services/packageResolution.service'
import type { PackageResultCache } from '../server/pipeline/packageResultCache'
import { resolveCachedPackage } from '../server/pipeline/resolveCachedPackage'
import {
  composePackageSize,
  type PackageSizeStats,
} from '../server/pipeline/packageEndpoints'
import {
  runCancellableBuild,
  type BuildAbortSignal,
} from '../server/pipeline/cancellableBuild'

const stats: PackageSizeStats = {
  size: 6500,
  gzip: 2600,
  dependencyCount: 0,
  hasSideEffects: false,
  hasJSModule: true,
  hasJSNext: false,
  isModuleType: false,
}

const cachedResult: PackageBuildInfo = {
  ...stats,
  name: 'react',
  version: '18.2.0',
  description: 'React',
  repository: 'https://github.com/facebook/react',
}

const resolvedReact: ResolvedPackage = {
  name: 'react',
  version: '18.2.0',
  scoped: false,
  packageString: 'react@18.2.0',
  description: 'React',
  repository: 'https://github.com/facebook/react.git',
}

function createCache() {
  const get = jest.fn<
    Promise<PackageBuildInfo | undefined>,
    [PackageIdentity]
  >()
  const set = jest.fn<Promise<void>, [PackageIdentity, PackageBuildInfo]>()
  const cache: PackageResultCache<PackageBuildInfo> = { get, set }
  return { cache, get, set }
}

describe('resolveCachedPackage', () => {
  it('serves an exactly-pinned cached package without contacting npm', async () => {
    const { cache, get } = createCache()
    get.mockResolvedValue(cachedResult)
    const resolvePackage = jest
      .fn<Promise<ResolvedPackage>, [PackageRequest]>()
      .mockRejectedValue(new Error('npm unavailable'))

    await expect(
      resolveCachedPackage(createPackageRequest('react@18.2.0'), cache, {
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
    const { cache, get } = createCache()
    get.mockResolvedValueOnce(undefined).mockResolvedValueOnce(cachedResult)
    const resolvePackage = jest
      .fn<Promise<ResolvedPackage>, [PackageRequest]>()
      .mockResolvedValue(resolvedReact)

    await expect(
      resolveCachedPackage(createPackageRequest('react@^18'), cache, {
        resolvePackage,
      })
    ).resolves.toEqual({ resolvedPackage: resolvedReact, cachedResult })
    expect(resolvePackage).toHaveBeenCalledTimes(1)
  })

  it('skips every cache read and resolves fresh on force-rebuild', async () => {
    const { cache, get } = createCache()
    get.mockResolvedValue(cachedResult)
    const resolvePackage = jest
      .fn<Promise<ResolvedPackage>, [PackageRequest]>()
      .mockResolvedValue({
        ...resolvedReact,
        version: '19.0.0',
        packageString: 'react@19.0.0',
      })

    await expect(
      resolveCachedPackage(
        createPackageRequest('react@18.2.0', PackageCacheMode.ForceRebuild),
        cache,
        { resolvePackage }
      )
    ).resolves.toEqual({
      resolvedPackage: expect.objectContaining({ version: '19.0.0' }),
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('composePackageSize', () => {
  it('attaches resolved identity and metadata to build stats', () => {
    expect(composePackageSize(resolvedReact, stats)).toEqual({
      ...stats,
      scoped: false,
      name: 'react',
      version: '18.2.0',
      description: 'React',
      repository: 'https://github.com/facebook/react.git',
    })
  })

  it('keeps missing package metadata null', () => {
    expect(
      composePackageSize(
        {
          name: 'example',
          version: '1.0.0',
          scoped: false,
          packageString: 'example@1.0.0',
          description: null,
          repository: null,
        },
        stats
      )
    ).toEqual(expect.objectContaining({ description: null, repository: null }))
  })
})

describe('runCancellableBuild', () => {
  it('cancels the active build when the request aborts', async () => {
    const cancel = jest.fn()
    let abortListener: (() => void) | undefined
    const signal: BuildAbortSignal = {
      aborted: false,
      addEventListener: (_type, listener) => {
        abortListener = listener
      },
      removeEventListener: () => {
        abortListener = undefined
      },
    }
    let finishBuild: ((value: PackageSizeStats) => void) | undefined
    const run = () =>
      new Promise<PackageSizeStats>(resolve => {
        finishBuild = resolve
      })

    const buildPromise = runCancellableBuild({ run, cancel, signal })
    await Promise.resolve()
    abortListener?.()
    expect(cancel).toHaveBeenCalledTimes(1)

    finishBuild?.(stats)
    await buildPromise
  })

  it('cancels without starting the build when already aborted', async () => {
    const cancel = jest.fn()
    const run = jest.fn<Promise<PackageSizeStats>, []>()
    const signal: BuildAbortSignal = {
      aborted: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }

    await expect(runCancellableBuild({ run, cancel, signal })).rejects.toThrow(
      /aborted/
    )
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })
})
