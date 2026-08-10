import gitURLParse from 'git-url-parse'
import parsePackageSpec from 'npm-package-arg'
import semver from 'semver'

import { parseJavaScriptPackageSpecifier } from '../../../languages/javascript'
import type { PackageReference } from '../../../types/language-domain'
import CustomError from '../../CustomError'
import BuildService from '../../api/BuildService'
import type {
  PackageBuildResult,
  PackageExportSizesResult,
  PackageExportsResult,
} from '../../types'
import type {
  AnalysisRequestOptions,
  PackageAnalysisAdapter,
  ResolvedAnalysisPackage,
} from '../contracts'

interface PacoteModule {
  manifest(
    spec: string,
    options: { fullMetadata: boolean },
  ): Promise<ResolvedPackageManifest>
}

const pacote = require('pacote') as PacoteModule

type RegistryPackageSpec = parsePackageSpec.RegistryResult & {
  escapedName: string
}

interface NpmRegistryFetchModule {
  json(path: string): Promise<ResolvedPackageManifest>
}

const registryFetch = require('npm-registry-fetch') as NpmRegistryFetchModule

interface PacoteManifestError {
  code?: string
  distTags?: Record<string, string>
  statusCode?: number
  versions?: string[]
}

export interface ResolvedPackageManifest {
  name: string
  version: string
  description?: string
  repository?: string | { url?: string }
  [key: string]: unknown
}

function isAliasPackageSpec(
  spec: parsePackageSpec.Result,
): spec is parsePackageSpec.AliasResult {
  return spec.type === 'alias'
}

function isRegistryPackageSpec(
  spec: parsePackageSpec.Result,
): spec is RegistryPackageSpec {
  return spec.registry && Boolean(spec.escapedName)
}

function registryManifestPath(name: string, version: string): string {
  return `/${name.replace('/', '%2f')}/${encodeURIComponent(version)}`
}

function isNotFound(error: unknown): boolean {
  const registryError = error as PacoteManifestError
  return registryError.code === 'E404' || registryError.statusCode === 404
}

async function fetchVersionManifest(name: string, version: string) {
  return registryFetch.json(registryManifestPath(name, version))
}

function registryPackageSpec(
  packageString: string,
): RegistryPackageSpec | null {
  const parsed = parsePackageSpec(packageString)
  const target = isAliasPackageSpec(parsed) ? parsed.subSpec : parsed
  return isRegistryPackageSpec(target) ? target : null
}

function toRepositoryUrl(repository: string | { url?: string } | undefined) {
  if (!repository) return ''
  try {
    const rawRepository =
      typeof repository === 'string' ? repository : (repository.url ?? '')
    return gitURLParse(rawRepository).toString('https')
  } catch {
    console.error('failed to parse repository url', repository)
    return ''
  }
}

export class JavaScriptPackageAnalysisAdapter implements PackageAnalysisAdapter<'javascript'> {
  readonly language = 'javascript' as const

  constructor(private readonly buildService = new BuildService()) {}

  private async resolveManifest(
    packageString: string,
  ): Promise<ResolvedPackageManifest> {
    let requestedVersion = 'latest'
    let packageName: string | undefined

    try {
      const packageSpec = registryPackageSpec(packageString)
      if (!packageSpec) {
        return await pacote.manifest(packageString, { fullMetadata: true })
      }

      const targetName = packageSpec.escapedName
      packageName = targetName
      requestedVersion = packageSpec.fetchSpec || 'latest'

      if (packageSpec.type === 'version') {
        requestedVersion = semver.clean(requestedVersion) ?? requestedVersion
        return await fetchVersionManifest(targetName, requestedVersion)
      }
      if (packageSpec.type === 'tag') {
        return await fetchVersionManifest(targetName, requestedVersion)
      }

      const manifest = await pacote.manifest(packageString, {
        fullMetadata: false,
      })
      return await fetchVersionManifest(manifest.name, manifest.version)
    } catch (error) {
      const pacoteError = error as PacoteManifestError
      if (pacoteError.code === 'ETARGET') {
        throw new CustomError('PackageVersionMismatchError', null, {
          validVersions: [
            ...Object.keys(pacoteError.distTags ?? {}),
            ...(pacoteError.versions ?? []),
          ],
        })
      }

      if (packageName && requestedVersion !== 'latest' && isNotFound(error)) {
        try {
          const latest = await fetchVersionManifest(packageName, 'latest')
          throw new CustomError('PackageVersionMismatchError', null, {
            suggestedVersion: latest.version,
          })
        } catch (latestError) {
          if (latestError instanceof CustomError) throw latestError
          if (!isNotFound(latestError)) {
            throw new CustomError(
              'PackageNotFoundError',
              latestError,
              undefined,
            )
          }
        }
      }

      throw new CustomError('PackageNotFoundError', error, undefined)
    }
  }

  async resolvePackage(
    reference: PackageReference<'javascript'>,
  ): Promise<ResolvedAnalysisPackage<'javascript'>> {
    const manifest = await this.resolveManifest(reference.specifier)
    const description = manifest.description
      ? manifest.description.length > 300
        ? `${manifest.description.substring(0, 300)}…`
        : manifest.description
      : ''

    return {
      language: this.language,
      specifier: reference.specifier,
      name: manifest.name,
      version: manifest.version,
      displayName: manifest.name,
      canonicalSpecifier: `${manifest.name}@${manifest.version}`,
      description,
      repository: toRepositoryUrl(manifest.repository),
    }
  }

  isExactVersionSpecifier(specifier: string): boolean {
    return Boolean(
      semver.valid(parseJavaScriptPackageSpecifier(specifier).version),
    )
  }

  analyzePackage(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions,
  ): Promise<PackageBuildResult> {
    return this.buildService.getPackageBuildStats(
      resolved.canonicalSpecifier,
      options.priority,
      options,
    )
  }

  analyzePackageExports(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions,
  ): Promise<PackageExportsResult> {
    return this.buildService.getPackageExports(
      resolved.canonicalSpecifier,
      options.priority,
      options,
    )
  }

  analyzePackageExportSizes(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions,
  ): Promise<PackageExportSizesResult> {
    return this.buildService.getPackageExportSizes(
      resolved.canonicalSpecifier,
      options.priority,
      options,
    )
  }
}
