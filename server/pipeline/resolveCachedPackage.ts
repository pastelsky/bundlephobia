import type { PackageIdentity } from '../../types/package-domain'
import {
  createResolvedPackage,
  getExactRequestedVersion,
  resolvePackageRequest,
} from '../services/packageResolution.service'
import type { PackageRequest, ResolvedPackage } from '../types'
import { cachePolicy } from './cachePolicy'
import type { PackageResultCache } from './packageResultCache'

/** A cached body always carries identity; some also carry npm metadata. */
type CachedPackageBody = PackageIdentity &
  Partial<{ description: string | null; repository: string | null }>

export interface CachedPackageLookup<TResult> {
  resolvedPackage: ResolvedPackage
  /** Present only on a cache hit. */
  cachedResult?: TResult
}

interface ResolveOverrides {
  resolvePackage?: typeof resolvePackageRequest
}

// Rebuilds a ResolvedPackage from a cache hit so logging and error context work
// without a second npm round-trip. Metadata the body lacks stays null.
function resolvedPackageFromCache(
  request: PackageRequest,
  body: CachedPackageBody
): ResolvedPackage {
  return createResolvedPackage(request, {
    name: body.name,
    version: body.version,
    description: body.description ?? undefined,
    repository: body.repository ?? undefined,
  })
}

/**
 * SSR fast lane: read the cache for an exactly-pinned version without ever
 * contacting npm, so a cached page still renders when npm is unreachable.
 * Returns null for tags, ranges, force-rebuild, or a cache miss.
 */
export async function readCachedExactVersion<TResult>(
  request: PackageRequest,
  cache: PackageResultCache<TResult>
): Promise<TResult | null> {
  if (!cachePolicy(request.cacheMode).readsCache) {
    return null
  }
  const exactVersion = getExactRequestedVersion(request)
  if (exactVersion === null) {
    return null
  }
  const cached = await cache.get({ name: request.name, version: exactVersion })
  return cached ?? null
}

/**
 * Resolves a request to one exact version and reads its cached result.
 * An exactly-pinned version is read straight from the cache before resolving
 * (the npm-down / SSR fast path); tags and ranges resolve through npm first
 * and are then read by their resolved version. Force-rebuild skips every read.
 */
export async function resolveCachedPackage<TResult extends CachedPackageBody>(
  request: PackageRequest,
  cache: PackageResultCache<TResult> | null,
  { resolvePackage = resolvePackageRequest }: ResolveOverrides = {}
): Promise<CachedPackageLookup<TResult>> {
  const { readsCache } = cachePolicy(request.cacheMode)
  const exactVersion = getExactRequestedVersion(request)

  if (cache && readsCache && exactVersion !== null) {
    const cachedResult = await cache.get({
      name: request.name,
      version: exactVersion,
    })
    if (cachedResult) {
      return {
        resolvedPackage: resolvedPackageFromCache(request, cachedResult),
        cachedResult,
      }
    }
  }

  const resolvedPackage = await resolvePackage(request)

  const exactVersionAlreadyRead =
    exactVersion !== null &&
    resolvedPackage.name === request.name &&
    resolvedPackage.version === exactVersion

  if (cache && readsCache && !exactVersionAlreadyRead) {
    const cachedResult = await cache.get({
      name: resolvedPackage.name,
      version: resolvedPackage.version,
    })
    if (cachedResult) {
      return { resolvedPackage, cachedResult }
    }
  }

  return { resolvedPackage }
}
