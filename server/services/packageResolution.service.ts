import gitURLParse from 'git-url-parse'
import semver from 'semver'

import { parsePackageString } from '../../utils/common.utils'
import {
  resolvePackage,
  type ResolvedPackageManifest,
} from '../../utils/server.utils'
import { PackageCacheMode } from '../../utils/packageApi.utils'
import type { PackageRequest, ResolvedPackage } from '../types'

export function createPackageRequest(
  packageString: string,
  cacheMode: PackageCacheMode = PackageCacheMode.CacheFirst
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

export function getExactRequestedVersion(
  packageRequest: Pick<PackageRequest, 'version'>
): string | null {
  const { version } = packageRequest
  return version !== null && semver.valid(version) !== null ? version : null
}

function normalizeRepositoryUrl(
  repository: string | { url?: string } | undefined
): string | null {
  try {
    const rawRepository =
      typeof repository === 'string' ? repository : repository?.url
    const normalizedRepository = rawRepository?.trim()
    if (
      normalizedRepository === undefined ||
      normalizedRepository.length === 0
    ) {
      return null
    }
    return gitURLParse(normalizedRepository).toString('https')
  } catch {
    return null
  }
}

function truncateDescription(description: string | undefined): string | null {
  const normalizedDescription = description?.trim()
  if (
    normalizedDescription === undefined ||
    normalizedDescription.length === 0
  ) {
    return null
  }
  return normalizedDescription.length > 300
    ? `${normalizedDescription.substring(0, 300)}…`
    : normalizedDescription
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
