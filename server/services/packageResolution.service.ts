import gitURLParse from 'git-url-parse'

import { parsePackageString } from '../../utils/common.utils'
import {
  resolvePackage,
  type ResolvedPackageManifest,
} from '../../utils/server.utils'
import type { RequestedPackage, ResolvedPackageState } from '../types'

export function createRequestedPackage(
  packageString: string
): RequestedPackage {
  return {
    ...parsePackageString(packageString),
    packageString,
  }
}

export function requireResolvedPackage(
  resolvedPackage: ResolvedPackageState | undefined
): ResolvedPackageState {
  if (!resolvedPackage) {
    throw new Error('Package request reached a build stage before resolution')
  }

  return resolvedPackage
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

export function createResolvedPackage(
  requestedPackage: RequestedPackage,
  manifest: ResolvedPackageManifest
): ResolvedPackageState {
  return {
    name: manifest.name,
    version: manifest.version,
    scoped: requestedPackage.scoped,
    packageString: `${manifest.name}@${manifest.version}`,
    description: truncateDescription(manifest.description),
    repository: normalizeRepositoryUrl(manifest.repository),
  }
}

export async function resolveRequestedPackage(
  requestedPackage: RequestedPackage
): Promise<ResolvedPackageState> {
  const manifest = await resolvePackage(requestedPackage.packageString)
  return createResolvedPackage(requestedPackage, manifest)
}
