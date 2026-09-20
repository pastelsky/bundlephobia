export type CachePrimitive = string | number | boolean | null

export type CacheObject = {
  [key: string]: CacheValue
}

export type CacheValue = CachePrimitive | CacheObject | CacheValue[]

export type CacheEntry = Exclude<CacheValue, null>

export interface CacheKey {
  name: string
  version: string
}

export interface CacheRequestBody extends CacheKey {
  result: CacheEntry
}

export interface PackageCacheResult extends CacheKey {
  size: number
  gzip: number
}

export interface CachedExportAsset {
  name: string
  gzip?: number
  type?: string
}

export interface ExportsCacheResult extends CacheKey {
  assets: CachedExportAsset[]
}

export type CacheReadResult<T> =
  | { status: 'hit'; value: T }
  | { status: 'miss' }
  | { status: 'unavailable'; error: Error }
  | { status: 'invalid'; error: Error }

export type CacheRoute = 'package' | 'exports'

export const CACHE_ROUTE = {
  package: '/package-cache',
  exports: '/exports-cache',
} as const satisfies Record<CacheRoute, string>
