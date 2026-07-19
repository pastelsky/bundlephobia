import semver from 'semver'

import type {
  PackageBuildInfo,
  PackageBuildResult,
  PackageMetadata,
} from '../../types/package-domain'
import Cache, { type CacheKey } from '../../utils/cache.utils'
import type {
  PackageRequest,
  PackageSizeCacheResult,
  ResolvedPackage,
} from '../types'
import { resolvePackageRequest } from './packageResolution.service'

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
  builder?: PackageSizeBuilder
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
  private packageSizeBuilder?: PackageSizeBuilder

  constructor(dependencies: PackageSizeServiceDependencies = {}) {
    this.cache = dependencies.cache ?? createPackageSizeCache()
    this.resolvePackage = dependencies.resolvePackage ?? resolvePackageRequest
    this.packageSizeBuilder = dependencies.builder
  }

  private async getPackageSizeBuilder(): Promise<PackageSizeBuilder> {
    if (!this.packageSizeBuilder) {
      const { buildService } = await import('../api/BuildService')
      this.packageSizeBuilder = {
        build: (packageString, priority) =>
          buildService.getPackageBuildStats<PackageSizeBuild>(
            packageString,
            priority
          ),
        cancel: packageString =>
          buildService.cancelPackageBuildStats(packageString),
      }
    }

    return this.packageSizeBuilder
  }

  async findPackageSize(
    packageRequest: PackageRequest
  ): Promise<PackageSizeCacheResult> {
    const { name, version, cacheMode } = packageRequest
    const shouldReadCache = cacheMode !== 'refresh'
    const hasExactVersion = version !== null && semver.valid(version) !== null

    if (shouldReadCache && hasExactVersion) {
      const exactResult = await this.cache.get({ name, version })

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

    if (shouldReadCache) {
      const exactVersionWasAlreadyChecked =
        hasExactVersion &&
        resolvedPackage.name === name &&
        resolvedPackage.version === version
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
    priority: number,
    signal?: PackageBuildAbortSignal
  ): Promise<PackageBuildResult> {
    const builder = await this.getPackageSizeBuilder()
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

    void this.cache.set(
      { name: resolvedPackage.name, version: resolvedPackage.version },
      result
    )

    return result
  }
}

export const packageSizeService = new PackageSizeService()
