import type {
  PackageBuildInfo,
  PackageBuildResult,
  PackageMetadata,
} from '../../types/package-domain'
import Cache, { type CacheKey } from '../../utils/cache.utils'
import { PackageCacheMode } from '../../utils/packageApi.utils'
import type {
  PackageRequest,
  PackageSizeCacheResult,
  ResolvedPackage,
} from '../types'
import {
  getExactRequestedVersion,
  resolvePackageRequest,
} from './packageResolution.service'

export type PackageSizeBuild = Omit<
  PackageBuildResult,
  keyof PackageMetadata | 'scoped'
>

export interface PackageSizeCache {
  get(key: CacheKey): Promise<PackageBuildInfo | undefined>
  set(key: CacheKey, result: PackageBuildInfo): Promise<void>
}

export type PackageResolver = typeof resolvePackageRequest

export interface PackageSizeBuilder {
  build(packageString: string, priority: number): Promise<PackageSizeBuild>
  cancel(packageString: string): void
}

export interface PackageBuildAbortSignal {
  readonly aborted: boolean
  addEventListener(
    type: 'abort',
    listener: () => void,
    options: { once: true }
  ): void
  removeEventListener(type: 'abort', listener: () => void): void
}

interface PackageSizeServiceDependencies {
  cache?: PackageSizeCache
  resolvePackage?: PackageResolver
}

interface PackageSizeBuildOptions {
  builder: PackageSizeBuilder
  priority: number
  signal?: PackageBuildAbortSignal
}

function createPackageSizeCache(): PackageSizeCache {
  const cache = new Cache()

  return {
    get: key => cache.getPackageSize<PackageBuildInfo>(key),
    set: (key, result) => cache.setPackageSize(key, result),
  }
}

function resolvedFromCachedResult(
  packageRequest: PackageRequest,
  result: PackageBuildInfo
): ResolvedPackage {
  return {
    name: result.name,
    version: result.version,
    scoped: packageRequest.scoped,
    packageString: `${result.name}@${result.version}`,
    description: result.description,
    repository: result.repository,
  }
}

export class PackageSizeService {
  private readonly cache: PackageSizeCache
  private readonly resolvePackage: PackageResolver

  constructor(dependencies: PackageSizeServiceDependencies = {}) {
    this.cache = dependencies.cache ?? createPackageSizeCache()
    this.resolvePackage = dependencies.resolvePackage ?? resolvePackageRequest
  }

  async findPackageSize(
    packageRequest: PackageRequest
  ): Promise<PackageSizeCacheResult> {
    const { name, cacheMode } = packageRequest
    const shouldReadCache = cacheMode !== PackageCacheMode.ForceRebuild
    const exactRequestedVersion = getExactRequestedVersion(packageRequest)

    // Exact versions can be looked up before npm resolution. This is the SSR
    // fast path: a cache hit remains available even when npm is unavailable.
    if (shouldReadCache && exactRequestedVersion !== null) {
      const exactResult = await this.cache.get({
        name,
        version: exactRequestedVersion,
      })

      if (exactResult) {
        return {
          kind: 'cache-hit',
          resolvedPackage: resolvedFromCachedResult(
            packageRequest,
            exactResult
          ),
          result: exactResult,
        }
      }
    }

    const resolvedPackage = await this.resolvePackage(packageRequest)

    // Tags and version ranges must first resolve to one immutable version. A
    // second cache read then checks that exact key without ever starting a build.
    if (shouldReadCache) {
      const exactVersionWasAlreadyChecked =
        exactRequestedVersion !== null &&
        resolvedPackage.name === name &&
        resolvedPackage.version === exactRequestedVersion
      const cachedResult = exactVersionWasAlreadyChecked
        ? undefined
        : await this.cache.get({
            name: resolvedPackage.name,
            version: resolvedPackage.version,
          })

      if (cachedResult) {
        return { kind: 'cache-hit', resolvedPackage, result: cachedResult }
      }
    }

    return { kind: 'cache-miss', resolvedPackage }
  }

  async buildPackageSize(
    resolvedPackage: ResolvedPackage,
    { builder, priority, signal }: PackageSizeBuildOptions
  ): Promise<PackageBuildResult> {
    const cancelBuild = () => builder.cancel(resolvedPackage.packageString)

    if (signal?.aborted) {
      cancelBuild()
      throw new Error(`Build aborted for ${resolvedPackage.packageString}`)
    }

    signal?.addEventListener('abort', cancelBuild, { once: true })
    let buildResult: PackageSizeBuild
    try {
      buildResult = await builder.build(resolvedPackage.packageString, priority)
    } finally {
      signal?.removeEventListener('abort', cancelBuild)
    }

    const result: PackageBuildResult = {
      ...buildResult,
      scoped: resolvedPackage.scoped,
      name: resolvedPackage.name,
      version: resolvedPackage.version,
      description: resolvedPackage.description,
      repository: resolvedPackage.repository,
    }

    // Cache the composed domain result for every successful build. This also
    // replaces the old build-middleware force write, so legacy force requests
    // and the normalized force-rebuild mode follow the same persistence path.
    await this.cache.set(
      { name: resolvedPackage.name, version: resolvedPackage.version },
      result
    )

    return result
  }
}

export const packageSizeService = new PackageSizeService()
