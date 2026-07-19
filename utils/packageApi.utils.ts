export const PACKAGE_CACHE_MODES = [
  'cache-first',
  'force-rebuild',
  'cache-only',
] as const

export type PackageCacheMode = (typeof PACKAGE_CACHE_MODES)[number]
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
