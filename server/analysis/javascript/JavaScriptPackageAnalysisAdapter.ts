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

function isStringValue(value: unknown): value is string {
  return Object.prototype.toString.call(value) === '[object String]'
}

function isNumberValue(value: unknown): value is number {
  return Object.prototype.toString.call(value) === '[object Number]'
}

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    value !== null &&
    Object.prototype.toString.call(value) === '[object Object]' &&
    Object.values(Object(value)).every(isStringValue)
  )
}

function hasValidPacoteFields(error: PacoteManifestError): boolean {
  return (
    (!('code' in error) || isStringValue(error.code)) &&
    (!('distTags' in error) || isStringMap(error.distTags)) &&
    (!('statusCode' in error) || isNumberValue(error.statusCode)) &&
    (!('versions' in error) || Array.isArray(error.versions))
  )
}

function isPacoteManifestError(error: unknown): error is PacoteManifestError {
  if (
    error === null ||
    Object.prototype.toString.call(error) !== '[object Object]'
  ) {
    return false
  }

  // SAFETY: the object shape is validated by the field checks below.
  return hasValidPacoteFields(error as PacoteManifestError)
}

function isNotFound(error: unknown): error is PacoteManifestError {
  if (!isPacoteManifestError(error)) {
    return false
  }

  return error.code === 'E404' || error.statusCode === 404
}

function requestedVersion(packageSpec: NpmRegistryPackageSpec): string {
  const version = packageSpec.fetchSpec || 'latest'

  return packageSpec.type === 'version'
    ? (semver.clean(version) ?? version)
    : version
}

async function fetchManifestForSpec(
  packageString: string,
  packageSpec: NpmRegistryPackageSpec | null,
): Promise<NpmPackageManifest> {
  if (!packageSpec) {
    return fetchPackageManifest(packageString, { fullMetadata: true })
  }

  const version = requestedVersion(packageSpec)

  if (packageSpec.type === 'version' || packageSpec.type === 'tag') {
    return fetchPackageVersionManifest(packageSpec.name, version)
  }

  const manifest = await fetchPackageManifest(packageString, {
    fullMetadata: false,
  })

  return fetchPackageVersionManifest(manifest.name, manifest.version)
}

async function getVersionMismatchError(
  packageName: string,
): Promise<CustomError | null> {
  try {
    const latest = await fetchPackageVersionManifest(packageName, 'latest')

    return new CustomError('PackageVersionMismatchError', null, {
      suggestedVersion: latest.version,
    })
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }

    return new CustomError('PackageNotFoundError', error, undefined)
  }
}

function getTargetMismatchError(
  error: PacoteManifestError,
): CustomError | null {
  if (error.code !== 'ETARGET') {
    return null
  }

  return new CustomError('PackageVersionMismatchError', null, {
    validVersions: [
      ...Object.keys(error.distTags ?? {}),
      ...(error.versions ?? []),
    ],
  })
}

async function getManifestResolutionError(
  cause: unknown,
  packageName: string | undefined,
  version: string,
): Promise<CustomError> {
  const pacoteError = isPacoteManifestError(cause) ? cause : null

  const targetMismatchError = pacoteError
    ? getTargetMismatchError(pacoteError)
    : null

  if (targetMismatchError) {
    return targetMismatchError
  }

  if (packageName && version !== 'latest' && isNotFound(cause)) {
    const mismatchError = await getVersionMismatchError(packageName)

    if (mismatchError) {
      return mismatchError
    }
  }

  return new CustomError('PackageNotFoundError', cause, undefined)
}

export class JavaScriptPackageAnalysisAdapter implements PackageAnalysisAdapter<'javascript'> {
  readonly language = 'javascript' as const

  constructor(private readonly buildService = new BuildService()) {}

  private async resolveManifest(
    packageString: string,
  ): Promise<NpmPackageManifest> {
    const packageSpec = parseNpmRegistryPackageSpec(packageString)
    const packageName = packageSpec?.name
    const version = packageSpec ? requestedVersion(packageSpec) : 'latest'

    try {
      return await fetchManifestForSpec(packageString, packageSpec)
    } catch (error) {
      throw await getManifestResolutionError(error, packageName, version)
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
