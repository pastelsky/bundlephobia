import gitURLParse from 'git-url-parse'

import { parsePackageString } from '../../utils/common.utils'
import {
  resolvePackage,
  type ResolvedPackageManifest,
} from '../../utils/server.utils'
import type { PackageCacheMode } from '../../utils/packageApi.utils'
import type { PackageRequest, ResolvedPackage } from '../types'

export function createPackageRequest(
  packageString: string,
  cacheMode: PackageCacheMode = 'cache-first'
): PackageRequest {
  return {
    ...parsePackageString(packageString),
    packageString,
    cacheMode,
  }
}

export function requireResolvedPackage(
  resolvedPackage: ResolvedPackage | undefined
): ResolvedPackage {
  if (!resolvedPackage) {
    throw new Error('Package request reached a build stage before resolution')
  }

  return resolvedPackage
}

function normalizeRepositoryUrl(
  repository: string | { url?: string } | undefined
): string | null {
  if (repository === undefined || repository === '') return null

  try {
    const rawRepository =
      typeof repository === 'string' ? repository : repository.url
    if (rawRepository === undefined || rawRepository === '') return null
    return gitURLParse(rawRepository).toString('https')
  } catch {
    return null
  }
}

function truncateDescription(description: string | undefined): string | null {
  if (description === undefined || description === '') return null
  return description.length > 300
    ? `${description.substring(0, 300)}…`
    : description
}

export function createResolvedPackage(
  packageRequest: PackageRequest,
  manifest: ResolvedPackageManifest
): ResolvedPackage {
  return {
    name: manifest.name,
    version: manifest.version,
    scoped: packageRequest.scoped,
    packageString: `${manifest.name}@${manifest.version}`,
    description: truncateDescription(manifest.description),
    repository: normalizeRepositoryUrl(manifest.repository),
  }
}

export async function resolvePackageRequest(
  packageRequest: PackageRequest
): Promise<ResolvedPackage> {
  const manifest = await resolvePackage(packageRequest.packageString)
  return createResolvedPackage(packageRequest, manifest)
}
