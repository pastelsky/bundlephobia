import semver from 'semver'

import { fetchPackagePackument } from '../../clients/npmRegistry'
import { getOrLoadTrendsData } from '../cache'
import type { TrendsRelease } from '../types'

export async function fetchPackageReleases(packageName: string): Promise<{
  releases: TrendsRelease[]
  publishDates: Record<string, string>
}> {
  const cacheKey = `releases:${packageName}`
  return getOrLoadTrendsData(
    'releases',
    cacheKey,
    12 * 60 * 60 * 1000,
    async () => {
      const packument = await fetchPackagePackument(packageName)

      const time = packument.time || {}
      const publishDates: Record<string, string> = {}
      const releases: TrendsRelease[] = []

      for (const [version, rawDate] of Object.entries(time)) {
        if (version === 'created' || version === 'modified') continue
        if (!semver.valid(version) || semver.prerelease(version)) continue

        const date = rawDate.slice(0, 10)
        publishDates[version] = date

        const parsed = semver.parse(version)
        if (!parsed || parsed.prerelease.length > 0) continue

        const isMajor = parsed.minor === 0 && parsed.patch === 0
        const isMinor = parsed.patch === 0 && parsed.minor > 0

        if (isMajor || isMinor) {
          releases.push({ version, date, major: isMajor, minor: isMinor })
        }
      }

      releases.sort((a, b) => a.date.localeCompare(b.date))
      return { releases, publishDates }
    }
  )
}
