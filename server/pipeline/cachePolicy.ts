import { PackageCacheMode } from '../../utils/packageApi.utils'
import config from '../config'

/**
 * The single source of truth for what each cache mode means across the package
 * pipeline, so no middleware re-derives these rules from the enum:
 * - `readsCache`: consult caches before building (false only for force-rebuild)
 * - `notFoundOnMiss`: answer a cache miss with 404 instead of building
 * - `bypassesBlocklist`: allow a build despite blocklist / unsupported rules
 */
export interface CachePolicy {
  readsCache: boolean
  notFoundOnMiss: boolean
  bypassesBlocklist: boolean
}

export function cachePolicy(mode: PackageCacheMode): CachePolicy {
  return {
    readsCache: mode !== PackageCacheMode.ForceRebuild,
    notFoundOnMiss: mode === PackageCacheMode.CacheOnly,
    bypassesBlocklist: mode === PackageCacheMode.ForceRebuild,
  }
}

/** TTL for a successful size / exports response. */
export function sizeCacheMaxAge(
  mode: PackageCacheMode,
  hasExactVersion: boolean
): number {
  if (mode === PackageCacheMode.ForceRebuild) {
    return 0
  }
  return hasExactVersion
    ? config.CACHE.SIZE_API_HAS_VERSION
    : config.CACHE.SIZE_API_DEFAULT
}

/** TTL for an error response; force-rebuild never caches a failure. */
export function errorCacheMaxAge(
  mode: PackageCacheMode,
  baseTtl: number
): number {
  return mode === PackageCacheMode.ForceRebuild ? 0 : baseTtl
}
