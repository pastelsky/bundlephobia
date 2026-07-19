import semver from 'semver'

import type {
  PackageBuildInfo,
  PackageBuildResult,
  PackageMetadata,
} from '../../types/package-domain'
import Cache, { type CacheKey } from '../../utils/cache.utils'
import type {
  PackageSizeLookup,
  RequestedPackage,
  ResolvedPackageState,
} from '../types'
import { resolveRequestedPackage } from './packageResolution.service'

export type PackageSizeCachePolicy = 'read' | 'bypass'

export type PackageSizeBuild = Omit<
  PackageBuildResult,
  keyof PackageMetadata | 'scoped'
>

export interface PackageSizeCache {
  get(key: CacheKey): Promise<PackageBuildInfo | undefined>
  set(key: CacheKey, result: PackageBuildInfo): Promise<void>
}

export type RequestedPackageResolver = typeof resolveRequestedPackage

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
  resolvePackage?: RequestedPackageResolver
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
  requestedPackage: RequestedPackage,
  result: PackageBuildInfo
): ResolvedPackageState {
  return {
    name: result.name,
    version: result.version,
    scoped: requestedPackage.scoped,
    packageString: `${result.name}@${result.version}`,
    description: result.description,
    repository: result.repository,
  }
}

export class PackageSizeService {
  private readonly cache: PackageSizeCache
  private readonly resolvePackage: RequestedPackageResolver
  private packageSizeBuilder?: PackageSizeBuilder

  constructor(dependencies: PackageSizeServiceDependencies = {}) {
    this.cache = dependencies.cache ?? createPackageSizeCache()
    this.resolvePackage = dependencies.resolvePackage ?? resolveRequestedPackage
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

  async lookupPackageSize(
    requestedPackage: RequestedPackage,
    cachePolicy: PackageSizeCachePolicy = 'read'
  ): Promise<PackageSizeLookup> {
    const { name, version } = requestedPackage
    const shouldReadCache = cachePolicy === 'read'
    const hasExactVersion = version !== null && semver.valid(version) !== null

    if (shouldReadCache && hasExactVersion) {
      const exactResult = await this.cache.get({ name, version })

      if (exactResult) {
        return {
          kind: 'cache-hit',
          resolved: resolvedFromCachedResult(requestedPackage, exactResult),
          result: exactResult,
        }
      }
    }

    const resolved = await this.resolvePackage(requestedPackage)

    if (shouldReadCache) {
      const exactVersionWasAlreadyChecked =
        hasExactVersion &&
        resolved.name === name &&
        resolved.version === version
      const cachedResult = exactVersionWasAlreadyChecked
        ? undefined
        : await this.cache.get({
            name: resolved.name,
            version: resolved.version,
          })

      if (cachedResult) {
        return { kind: 'cache-hit', resolved, result: cachedResult }
      }
    }

    return { kind: 'cache-miss', resolved }
  }

  async buildPackageSize(
    resolved: ResolvedPackageState,
    priority: number,
    signal?: PackageBuildAbortSignal
  ): Promise<PackageBuildResult> {
    const builder = await this.getPackageSizeBuilder()
    const cancelBuild = () => builder.cancel(resolved.packageString)

    if (signal?.aborted) {
      cancelBuild()
      throw new Error(`Build aborted for ${resolved.packageString}`)
    }

    signal?.addEventListener('abort', cancelBuild, { once: true })
    let buildResult: PackageSizeBuild
    try {
      buildResult = await builder.build(resolved.packageString, priority)
    } finally {
      signal?.removeEventListener('abort', cancelBuild)
    }

    const result: PackageBuildResult = {
      ...buildResult,
      scoped: resolved.scoped,
      name: resolved.name,
      version: resolved.version,
      description: resolved.description,
      repository: resolved.repository,
    }

    void this.cache.set(
      { name: resolved.name, version: resolved.version },
      result
    )

    return result
  }
}

export const packageSizeService = new PackageSizeService()
