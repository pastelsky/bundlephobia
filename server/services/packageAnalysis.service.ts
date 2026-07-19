import gitURLParse from 'git-url-parse'
import semver from 'semver'

import type {
  PackageBuildInfo,
  PackageBuildResult,
} from '../../types/package-domain'
import Cache from '../../utils/cache.utils'
import { parsePackageString } from '../../utils/common.utils'
import { resolvePackage } from '../../utils/server.utils'
import type { ResolvedPackageState } from '../types'

export type PackageAnalysisMode = 'cache-only' | 'build-on-miss'

type PackageCache = Pick<Cache, 'getPackageSize' | 'setPackageSize'>
type PackageResolver = typeof resolvePackage
type PackageBuilder = (
  packageString: string,
  priority: number
) => Promise<PackageBuildResult>
type PackageBuildCanceler = (packageString: string) => void

export type PackageAnalysis = {
  resolved: ResolvedPackageState
  result: PackageBuildInfo | null
  source: 'cache' | 'build' | 'miss'
}

type AnalyzeOptions = {
  mode: PackageAnalysisMode
  force?: boolean
  priority?: number
}

type PackageAnalysisServiceDependencies = {
  cache?: PackageCache
  resolve?: PackageResolver
  build?: PackageBuilder
  cancelBuild?: PackageBuildCanceler
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
  parsedPackage: ReturnType<typeof parsePackageString>,
  result: PackageBuildInfo
): ResolvedPackageState {
  return {
    name: result.name,
    version: result.version,
    scoped: parsedPackage.scoped,
    packageString: `${result.name}@${result.version}`,
    description: result.description,
    repository: result.repository,
  }
}

export class PackageAnalysisService {
  private readonly cache: PackageCache
  private readonly resolvePackage: PackageResolver
  private packageBuilder?: PackageBuilder
  private cancelPackageBuild?: PackageBuildCanceler

  constructor(dependencies: PackageAnalysisServiceDependencies = {}) {
    this.cache = dependencies.cache ?? new Cache()
    this.resolvePackage = dependencies.resolve ?? resolvePackage
    this.packageBuilder = dependencies.build
    this.cancelPackageBuild = dependencies.cancelBuild
  }

  private async getPackageBuilder() {
    if (!this.packageBuilder) {
      const { default: BuildService } = await import('../api/BuildService')
      const buildService = new BuildService()
      this.packageBuilder = (packageString, priority) =>
        buildService.getPackageBuildStats<PackageBuildResult>(
          packageString,
          priority
        )
      this.cancelPackageBuild = packageString =>
        buildService.cancelPackageBuildStats(packageString)
    }

    return this.packageBuilder
  }

  async resolve(packageString: string): Promise<ResolvedPackageState> {
    const parsedPackage = parsePackageString(packageString)
    const manifest = await this.resolvePackage(packageString)

    return {
      name: manifest.name,
      version: manifest.version,
      scoped: parsedPackage.scoped,
      packageString: `${manifest.name}@${manifest.version}`,
      description: truncateDescription(manifest.description),
      repository: normalizeRepositoryUrl(manifest.repository),
    }
  }

  async lookup(packageString: string, force = false): Promise<PackageAnalysis> {
    const parsedPackage = parsePackageString(packageString)
    let attemptedExactCache = false

    if (
      !force &&
      parsedPackage.version &&
      semver.valid(parsedPackage.version)
    ) {
      attemptedExactCache = true
      const exactResult = await this.cache.getPackageSize<PackageBuildInfo>({
        name: parsedPackage.name,
        version: parsedPackage.version,
      })

      if (exactResult) {
        return {
          resolved: resolvedFromCachedResult(parsedPackage, exactResult),
          result: exactResult,
          source: 'cache',
        }
      }
    }

    const resolved = await this.resolve(packageString)

    if (!force) {
      const resolvedMatchesAttemptedExact =
        attemptedExactCache &&
        resolved.name === parsedPackage.name &&
        resolved.version === parsedPackage.version
      const cachedResult = resolvedMatchesAttemptedExact
        ? undefined
        : await this.cache.getPackageSize<PackageBuildInfo>({
            name: resolved.name,
            version: resolved.version,
          })

      if (cachedResult) {
        return { resolved, result: cachedResult, source: 'cache' }
      }
    }

    return { resolved, result: null, source: 'miss' }
  }

  async build(
    resolved: ResolvedPackageState,
    priority: number,
    signal?: AbortSignal
  ): Promise<PackageBuildResult> {
    const packageBuilder = await this.getPackageBuilder()
    const cancelBuild = () =>
      this.cancelPackageBuild?.(resolved.packageString)

    if (signal?.aborted) {
      cancelBuild()
      throw new Error(`Build aborted for ${resolved.packageString}`)
    }

    signal?.addEventListener('abort', cancelBuild, { once: true })
    let buildResult: PackageBuildResult
    try {
      buildResult = await packageBuilder(resolved.packageString, priority)
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

    void this.cache.setPackageSize(
      { name: resolved.name, version: resolved.version },
      result
    )

    return result
  }

  async analyze(
    packageString: string,
    options: AnalyzeOptions
  ): Promise<PackageAnalysis> {
    const analysis = await this.lookup(packageString, options.force)
    if (analysis.result || options.mode === 'cache-only') return analysis

    const result = await this.build(analysis.resolved, options.priority ?? 0)
    return { resolved: analysis.resolved, result, source: 'build' }
  }
}

export const packageAnalysisService = new PackageAnalysisService()
