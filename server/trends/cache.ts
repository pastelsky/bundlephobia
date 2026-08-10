import type { TrendsCacheName } from '../../types/cache-domain'
import CacheServiceClient from '../clients/cacheService'

const cache = new CacheServiceClient()

export async function getOrLoadTrendsData<T>(
  cacheName: TrendsCacheName,
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  // The cache service is queried before reaching an upstream data source.
  const cached = await cache.getTrendsData<T>(cacheName, { key })
  if (cached !== undefined) return cached

  const value = await load()
  // Cache availability must not determine whether trends data can be served.
  void cache.setTrendsData(cacheName, { key }, value, ttlMs)
  return value
}
