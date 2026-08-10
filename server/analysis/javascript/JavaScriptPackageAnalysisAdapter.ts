import semver from 'semver'

import { parseJavaScriptPackageSpecifier } from '../../../languages/javascript'
import type { PackageReference } from '../../../types/language-domain'
import {
  fetchPackageManifest,
  fetchPackageVersionManifest,
  type NpmPackageManifest,
} from '../../clients/npmRegistry'
import CustomError from '../../CustomError'
import BuildService from '../../api/BuildService'
import { parseNpmRegistryPackageSpec } from '../../packages/npmPackage'
import { normalizeRepositoryUrl } from '../../packages/repository'
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

interface PacoteManifestError {
  code?: string
  distTags?: Record<string, string>
  statusCode?: number
  versions?: string[]
}

function isNotFound(error: unknown): boolean {
  const registryError = error as PacoteManifestError
  return registryError.code === 'E404' || registryError.statusCode === 404
}

export class JavaScriptPackageAnalysisAdapter
  implements PackageAnalysisAdapter<'javascript'>
{
  readonly language = 'javascript' as const

  constructor(private readonly buildService = new BuildService()) {}

  private async resolveManifest(
    packageString: string,
  ): Promise<NpmPackageManifest> {
    let requestedVersion = 'latest'
    let packageName: string | undefined

    try {
      const packageSpec = parseNpmRegistryPackageSpec(packageString)
      if (!packageSpec) {
        return await fetchPackageManifest(packageString, {
          fullMetadata: true,
        })
      }

      const targetName = packageSpec.name
      packageName = targetName
      requestedVersion = packageSpec.fetchSpec || 'latest'

      if (packageSpec.type === 'version') {
        requestedVersion = semver.clean(requestedVersion) ?? requestedVersion
        return await fetchPackageVersionManifest(targetName, requestedVersion)
      }
      if (packageSpec.type === 'tag') {
        return await fetchPackageVersionManifest(targetName, requestedVersion)
      }

      const manifest = await fetchPackageManifest(packageString, {
        fullMetadata: false,
      })
      return await fetchPackageVersionManifest(manifest.name, manifest.version)
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
          const latest = await fetchPackageVersionManifest(
            packageName,
            'latest'
          )
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
      repository: normalizeRepositoryUrl(manifest.repository),
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
