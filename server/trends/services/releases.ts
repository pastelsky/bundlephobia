import semver from 'semver'

import { fetchPackagePackument } from '../../clients/npmRegistry'
import { getOrLoadTrendsData } from '../cache'
import { trendsConfig } from '../config'
import type { TrendsRelease } from '../types'

export async function fetchPackageReleases(packageName: string): Promise<{
  releases: TrendsRelease[]
  publishDates: Record<string, string>
}> {
  const cacheKey = `releases:${packageName}`
  return getOrLoadTrendsData(
    'releases',
    cacheKey,
    trendsConfig.cacheTtlMs.releases,
    async () => {
      const packument = await fetchPackagePackument(packageName)

      const time = packument.time || {}
      const publishDates: Record<string, string> = {}
      const releases: TrendsRelease[] = []

      for (const [version, rawDate] of Object.entries(time)) {
        const parsed = semver.parse(version)
        if (!parsed || parsed.prerelease.length > 0) continue

        const date = rawDate.slice(0, 10)
        publishDates[version] = date

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
