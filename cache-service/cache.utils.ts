import semver from 'semver'
import { z } from 'zod'
import type { CacheValue } from '@bundlephobia/service-contracts/cache'

export function encodeFirebaseKey(key: string) {
  return key.replace(/[.]/g, ',').replace(/\//g, '__')
}

export function latestBuiltVersion(entries: CacheValue): string | null {
  const parsed = z.record(z.string(), z.unknown()).safeParse(entries)

  if (!parsed.success) return null

  return (
    Object.keys(parsed.data)
      .map(version => version.replaceAll(',', '.'))
      .filter(version => semver.valid(version) && !semver.prerelease(version))
      .sort(semver.rcompare)[0] ?? null
  )
}
