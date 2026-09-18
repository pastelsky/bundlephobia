import gitURLParse from 'git-url-parse'
import parsePackageSpec from 'npm-package-arg'
import semver from 'semver'

import { parseJavaScriptPackageSpecifier } from '../../../languages/javascript'
import type { JsonObject, JsonValue } from '../../../types/json'
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

// SAFETY: the pinned pacote module implements the manifest contract used here.
const pacote = require('pacote') as PacoteModule

type RegistryPackageSpec = parsePackageSpec.RegistryResult & {
  escapedName: string
}

interface NpmRegistryFetchModule {
  json(path: string): Promise<ResolvedPackageManifest>
}

// SAFETY: the pinned registry client returns package manifests from JSON endpoints.
const registryFetch = require('npm-registry-fetch') as NpmRegistryFetchModule

interface PacoteManifestError {
  code?: string
  distTags?: Record<string, string>
  statusCode?: number
  versions?: string[]
}

interface ManifestRequestContext {
  packageName?: string
  requestedVersion: string
  packageSpec: RegistryPackageSpec | null
}

export interface ResolvedPackageManifest {
  name: string
  version: string
  description?: string
  repository?: string | JsonObject
  [key: string]: JsonValue | undefined
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

function isNotFound<T>(error: T): boolean {
  // SAFETY: the package clients expose these optional error fields on failures.
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

function manifestRequestContext(packageString: string): ManifestRequestContext {
  const packageSpec = registryPackageSpec(packageString)

  return {
    packageSpec,
    packageName: packageSpec?.escapedName,
    requestedVersion: packageSpec?.fetchSpec || 'latest',
  }
}

async function resolveRegistryManifest(
  packageString: string,
  context: ManifestRequestContext,
): Promise<ResolvedPackageManifest> {
  const { packageSpec } = context

  if (!packageSpec) {
    return pacote.manifest(packageString, { fullMetadata: true })
  }

  if (packageSpec.type === 'version') {
    const version =
      semver.clean(context.requestedVersion) ?? context.requestedVersion

    return fetchVersionManifest(packageSpec.escapedName, version)
  }

  if (packageSpec.type === 'tag') {
    return fetchVersionManifest(
      packageSpec.escapedName,
      context.requestedVersion,
    )
  }

  const manifest = await pacote.manifest(packageString, { fullMetadata: false })

  return fetchVersionManifest(manifest.name, manifest.version)
}

async function findVersionMismatchError(
  context: ManifestRequestContext,
): Promise<CustomError | null> {
  const packageName = context.packageName

  if (!packageName) return null

  try {
    const latest = await fetchVersionManifest(packageName, 'latest')

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
  // SAFETY: package-client failures are inspected only for these optional fields.
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
): Promise<ResolvedPackageManifest> {
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

function toRepositoryUrl(repository: string | { url?: string } | undefined) {
  if (!repository) return ''

  try {
    const rawRepository = hasRepositoryUrl(repository)
      ? (repository.url ?? '')
      : (repository ?? '')

    return gitURLParse(rawRepository).toString('https')
  } catch {
    console.error('failed to parse repository url', repository)

    return ''
  }
}

function hasRepositoryUrl(
  repository: string | { url?: string },
): repository is { url?: string } {
  return Object.prototype.toString.call(repository) === '[object Object]'
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
