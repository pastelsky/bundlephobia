import gitURLParse from 'git-url-parse'
import semver from 'semver'

import type {
  PackageBuildInfo,
  PackageBuildResult,
  PackageMetadata,
} from '../../types/package-domain'
import Cache, { type CacheKey } from '../../utils/cache.utils'
import { resolvePackage } from '../../utils/server.utils'
import type {
  PackageSizeLookup,
  RequestedPackage,
  ResolvedPackageState,
} from '../types'

export type PackageSizeCachePolicy = 'read' | 'bypass'

export type PackageSizeBuild = Omit<
  PackageBuildResult,
  keyof PackageMetadata | 'scoped'
>

export interface PackageSizeCache {
  get(key: CacheKey): Promise<PackageBuildInfo | undefined>
  set(key: CacheKey, result: PackageBuildInfo): Promise<void>
}

export type PackageMetadataResolver = typeof resolvePackage
export type PackageSizeBuilder = (
  packageString: string,
  priority: number
) => Promise<PackageSizeBuild>
export type PackageBuildCanceler = (packageString: string) => void

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
  resolvePackageMetadata?: PackageMetadataResolver
  buildPackageSize?: PackageSizeBuilder
  cancelPackageBuild?: PackageBuildCanceler
}

function createPackageSizeCache(): PackageSizeCache {
  const cache = new Cache()

  return {
    get: key => cache.getPackageSize<PackageBuildInfo>(key),
    set: (key, result) => cache.setPackageSize(key, result),
  }
}

function normalizeRepositoryUrl(
  repository: string | { url?: string } | undefined
) {
  if (!repository) return ''

  try {
    const rawRepository =
      typeof repository === 'string' ? repository : repository.url ?? ''
    return gitURLParse(rawRepository).toString('https')
  } catch {
    return ''
  }
}

function truncateDescription(description: string | undefined) {
  if (!description) return ''
  return description.length > 300
    ? `${description.substring(0, 300)}…`
    : description
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
  private readonly resolvePackageMetadata: PackageMetadataResolver
  private packageSizeBuilder?: PackageSizeBuilder
  private cancelPackageBuild?: PackageBuildCanceler

  constructor(dependencies: PackageSizeServiceDependencies = {}) {
    this.cache = dependencies.cache ?? createPackageSizeCache()
    this.resolvePackageMetadata =
      dependencies.resolvePackageMetadata ?? resolvePackage
    this.packageSizeBuilder = dependencies.buildPackageSize
    this.cancelPackageBuild = dependencies.cancelPackageBuild
  }

  private async getPackageSizeBuilder(): Promise<PackageSizeBuilder> {
    if (!this.packageSizeBuilder) {
      const { default: BuildService } = await import('../api/BuildService')
      const buildService = new BuildService()
      this.packageSizeBuilder = (packageString, priority) =>
        buildService.getPackageBuildStats<PackageSizeBuild>(
          packageString,
          priority
        )
      this.cancelPackageBuild = packageString =>
        buildService.cancelPackageBuildStats(packageString)
    }

    return this.packageSizeBuilder
  }

  async resolvePackage(
    requestedPackage: RequestedPackage
  ): Promise<ResolvedPackageState> {
    const manifest = await this.resolvePackageMetadata(
      requestedPackage.packageString
    )

    return {
      name: manifest.name,
      version: manifest.version,
      scoped: requestedPackage.scoped,
      packageString: `${manifest.name}@${manifest.version}`,
      description: truncateDescription(manifest.description),
      repository: normalizeRepositoryUrl(manifest.repository),
    }
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
    const buildPackageSize = await this.getPackageSizeBuilder()
    const cancelBuild = () => this.cancelPackageBuild?.(resolved.packageString)

    if (signal?.aborted) {
      cancelBuild()
      throw new Error(`Build aborted for ${resolved.packageString}`)
    }

    signal?.addEventListener('abort', cancelBuild, { once: true })
    let buildResult: PackageSizeBuild
    try {
      buildResult = await buildPackageSize(resolved.packageString, priority)
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
