export const TRENDS_CACHE_NAMES = [
  'downloads',
  'github-history',
  'releases',
  'repository',
  'size-history',
] as const

export type TrendsCacheName = (typeof TRENDS_CACHE_NAMES)[number]
