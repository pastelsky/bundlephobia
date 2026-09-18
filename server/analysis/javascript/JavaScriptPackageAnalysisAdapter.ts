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
import {
  normalizeRepositoryUrl,
  parseNpmRegistryPackageSpec,
} from '../../packages/npmPackage'
import type { NpmRegistryPackageSpec } from '../../packages/npmPackage'
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

interface ManifestRequestContext {
  packageName?: string
  requestedVersion: string
  packageSpec: NpmRegistryPackageSpec | null
}

function isNotFound<T>(error: T): boolean {
  // SAFETY: pacote exposes these optional error fields on failures.
  const registryError = error as PacoteManifestError

  return registryError.code === 'E404' || registryError.statusCode === 404
}

function manifestRequestContext(packageString: string): ManifestRequestContext {
  const packageSpec = parseNpmRegistryPackageSpec(packageString)

  return {
    packageSpec,
    packageName: packageSpec?.name,
    requestedVersion: packageSpec?.fetchSpec || 'latest',
  }
}

async function resolveRegistryManifest(
  packageString: string,
  context: ManifestRequestContext,
): Promise<NpmPackageManifest> {
  const { packageSpec } = context

  if (!packageSpec) {
    return fetchPackageManifest(packageString, { fullMetadata: true })
  }

  if (packageSpec.type === 'version') {
    const version =
      semver.clean(context.requestedVersion) ?? context.requestedVersion

    return fetchPackageVersionManifest(packageSpec.name, version)
  }

  if (packageSpec.type === 'tag') {
    return fetchPackageVersionManifest(
      packageSpec.name,
      context.requestedVersion,
    )
  }

  const manifest = await fetchPackageManifest(packageString, {
    fullMetadata: false,
  })

  return fetchPackageVersionManifest(manifest.name, manifest.version)
}

async function findVersionMismatchError(
  context: ManifestRequestContext,
): Promise<CustomError | null> {
  const packageName = context.packageName

  if (!packageName) return null

  try {
    const latest = await fetchPackageVersionManifest(packageName, 'latest')

    return new CustomError('PackageVersionMismatchError', null, {
      suggestedVersion: latest.version,
    })
  } catch (latestError) {
    if (latestError instanceof CustomError) return latestError

    if (!isNotFound(latestError)) {
      return new CustomError('PackageNotFoundError', latestError, undefined)
    }

    return null
  }
}

function toManifestError<T>(error: T): never {
  // SAFETY: pacote failures expose these optional error fields.
  const pacoteError = error as PacoteManifestError

  if (pacoteError.code === 'ETARGET') {
    throw new CustomError('PackageVersionMismatchError', null, {
      validVersions: [
        ...Object.keys(pacoteError.distTags ?? {}),
        ...(pacoteError.versions ?? []),
      ],
    })
  }

  throw new CustomError('PackageNotFoundError', error, undefined)
}

async function resolveManifest(
  packageString: string,
): Promise<NpmPackageManifest> {
  let context: ManifestRequestContext = {
    packageSpec: null,
    requestedVersion: 'latest',
  }

  try {
    context = manifestRequestContext(packageString)

    return await resolveRegistryManifest(packageString, context)
  } catch (error) {
    if (
      context.packageName &&
      context.requestedVersion !== 'latest' &&
      isNotFound(error)
    ) {
      const mismatchError = await findVersionMismatchError(context)

      if (mismatchError) throw mismatchError
    }

    return toManifestError(error)
  }
}

export class JavaScriptPackageAnalysisAdapter implements PackageAnalysisAdapter<'javascript'> {
  readonly language = 'javascript' as const

  constructor(private readonly buildService = new BuildService()) {}

  private resolveManifest(packageString: string) {
    return resolveManifest(packageString)
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
