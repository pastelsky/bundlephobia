export enum PackageCacheMode {
  CacheFirst = 'cache-first',
  ForceRebuild = 'force-rebuild',
  CacheOnly = 'cache-only',
}

export const PACKAGE_CACHE_MODES = Object.values(PackageCacheMode)
export type PackageApiEndpoint =
  | 'size'
  | 'exports'
  | 'exports-sizes'
  | 'dependencies'
  | 'package-history'
  | 'similar-packages'

interface PackageApiPathOptions {
  cacheMode?: PackageCacheMode
  limit?: number
  record?: boolean
}

export function isPackageCacheMode(value: unknown): value is PackageCacheMode {
  return PACKAGE_CACHE_MODES.some(cacheMode => cacheMode === value)
}

export function createPackageApiPath(
  endpoint: PackageApiEndpoint,
  packageString: string,
  { cacheMode, limit, record = false }: PackageApiPathOptions = {}
): string {
  const query = new URLSearchParams({ package: packageString })

  if (cacheMode !== undefined) query.set('cache', cacheMode)
  if (limit !== undefined) query.set('limit', String(limit))
  if (record) query.set('record', 'true')

  return `/api/${endpoint}?${query.toString()}`
}
