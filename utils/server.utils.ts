import 'dotenv-defaults/config'

import type { Context } from 'koa'
import parsePackageSpec from 'npm-package-arg'
import semver from 'semver'

import CustomError from '../server/CustomError'
import Queue from '../server/Queue'

interface PacoteModule {
  manifest(
    spec: string,
    options: { fullMetadata: boolean }
  ): Promise<ResolvedPackageManifest>
}

const pacote = require('pacote') as PacoteModule

type RegistryPackageSpec = parsePackageSpec.RegistryResult & {
  escapedName: string
}

function isAliasPackageSpec(
  spec: parsePackageSpec.Result
): spec is parsePackageSpec.AliasResult {
  return spec.type === 'alias'
}

function isRegistryPackageSpec(
  spec: parsePackageSpec.Result
): spec is RegistryPackageSpec {
  return spec.registry && Boolean(spec.escapedName)
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
  packageString: string
): RegistryPackageSpec | null {
  const parsed = parsePackageSpec(packageString)
  const target = isAliasPackageSpec(parsed) ? parsed.subSpec : parsed

  if (!isRegistryPackageSpec(target)) {
    return null
  }

  return target
}

export async function resolvePackage(
  packageString: string
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
        if (latestError instanceof CustomError) {
          throw latestError
        }
        if (!isNotFound(latestError)) {
          throw new CustomError('PackageNotFoundError', latestError, undefined)
        }
      }
    }

    throw new CustomError('PackageNotFoundError', error, undefined)
  }
}

export function getRequestPriority(ctx: Context): number {
  const client = ctx.headers['x-bundlephobia-user']

  switch (client) {
    case 'bundlephobia website':
      return Queue.priority.HIGH
    case 'bundlephobia mcp tool':
      return Queue.priority.MEDIUM
    case 'yarn website':
    default:
      return Queue.priority.LOW
  }
}
