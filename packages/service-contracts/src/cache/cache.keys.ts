import { normalizeEntryPoint } from '../package.contract.ts'
import type { CacheKey } from './cache.type.ts'

/** Preserve legacy root records; group subpath measurements by import then version. */
export function cacheStoragePath(
  root: string,
  key: Omit<CacheKey, 'version'> & { version?: string },
): string[] {
  const entryPoint = normalizeEntryPoint(key.entryPoint)

  const path = [
    entryPoint ? `${root}-entry-points` : root,
    key.name.replace(/\./g, ',').replace(/\//g, '__'),
  ]

  if (entryPoint)
    path.push(encodeURIComponent(entryPoint).replace(/\./g, '%2E'))

  if (key.version) path.push(key.version.replace(/\./g, ','))

  return path
}

export function matchesCacheKey(actual: CacheKey, expected: CacheKey): boolean {
  return (
    actual.name === expected.name &&
    actual.version === expected.version &&
    normalizeEntryPoint(actual.entryPoint) ===
      normalizeEntryPoint(expected.entryPoint)
  )
}
