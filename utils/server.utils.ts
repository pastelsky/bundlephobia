import 'dotenv-defaults/config'

import type { Context } from 'koa'
import semver from 'semver'

import CustomError from '../server/CustomError'
import Queue from '../server/Queue'
import { parsePackageString } from './common.utils'

interface PacoteModule {
  manifest(
    spec: string,
    options: { fullMetadata: boolean }
  ): Promise<ResolvedPackageManifest>
}

const pacote = require('pacote') as PacoteModule

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

export async function resolvePackage(
  packageString: string
): Promise<ResolvedPackageManifest> {
  const { name, version } = parsePackageString(packageString)
  const requestedVersion = version ?? 'latest'

  try {
    if (
      !semver.validRange(requestedVersion) ||
      semver.valid(requestedVersion)
    ) {
      return await fetchVersionManifest(name, requestedVersion)
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

    if (requestedVersion !== 'latest' && isNotFound(error)) {
      try {
        const latest = await fetchVersionManifest(name, 'latest')
        throw new CustomError('PackageVersionMismatchError', null, {
          validVersions: [latest.version],
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
