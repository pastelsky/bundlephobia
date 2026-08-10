import axios from 'axios'
import semver from 'semver'

import { getCached, setCached } from './memoryCache'
import type { TrendsRelease } from './types'

type NpmPackument = {
  time?: Record<string, string>
  versions?: Record<string, unknown>
}

export async function fetchPackageReleases(packageName: string): Promise<{
  releases: TrendsRelease[]
  publishDates: Record<string, string>
}> {
  const cacheKey = `releases:${packageName}`
  const cached = getCached<{
    releases: TrendsRelease[]
    publishDates: Record<string, string>
  }>(cacheKey)
  if (cached) {
    return cached
  }

  const { data } = await axios.get<NpmPackument>(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
    {
      timeout: 15_000,
      headers: { Accept: 'application/json' },
    }
  )

  const time = data.time || {}
  const publishDates: Record<string, string> = {}
  const releases: TrendsRelease[] = []

  for (const [version, rawDate] of Object.entries(time)) {
    if (version === 'created' || version === 'modified') {
      continue
    }
    if (!semver.valid(version) || semver.prerelease(version)) {
      continue
    }

    const date = rawDate.slice(0, 10)
    publishDates[version] = date

    const parsed = semver.parse(version)
    if (!parsed || parsed.prerelease.length > 0) {
      continue
    }

    const isMajor = parsed.minor === 0 && parsed.patch === 0
    const isMinor = parsed.patch === 0 && parsed.minor > 0

    if (isMajor || isMinor) {
      releases.push({
        version,
        date,
        major: isMajor,
        minor: isMinor,
      })
    }
  }

  releases.sort((a, b) => a.date.localeCompare(b.date))

  const result = { releases, publishDates }
  setCached(cacheKey, result, 12 * 60 * 60 * 1000)
  return result
}
