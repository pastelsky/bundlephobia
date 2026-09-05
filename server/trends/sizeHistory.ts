import axios from 'axios'
import semver from 'semver'

import firebaseUtils from '../../utils/firebase.utils'
import { getCached, setCached } from './memoryCache'
import type { PackageHistoryResponse } from '../../../types/package-history'
import type { TrendsPoint } from './types'

type HistorySnapshot = {
  size?: number
  gzip?: number
  version?: string
}

async function fetchHistory(packageName: string) {
  const firebaseHistory = (await firebaseUtils.getPackageHistory(
    packageName,
    40
  )) as Record<string, HistorySnapshot>

  if (
    Object.values(firebaseHistory).some(
      snapshot => typeof snapshot?.gzip === 'number'
    ) ||
    process.env.FIREBASE_DATABASE_URL
  ) {
    return firebaseHistory
  }

  // Local development does not normally have production Firebase credentials.
  // Use Bundlephobia's public, read-only history endpoint so the trends UI can
  // exercise the same first-party snapshots without copying credentials.
  const cacheKey = `public-size-history:${packageName}`
  const cached = getCached<Record<string, HistorySnapshot>>(cacheKey)
  if (cached) return cached

  const { data } = await axios.get<PackageHistoryResponse>(
    'https://bundlephobia.com/api/package-history',
    {
      params: { package: packageName, limit: 40 },
      timeout: 15_000,
      headers: { Accept: 'application/json' },
    }
  )
  const history = Object.fromEntries(
    data.versions.map(version => [version.version, {
      size: version.size ?? undefined,
      gzip: version.gzip ?? undefined,
      version: version.version,
    }]),
  )
  setCached(cacheKey, history, 30 * 60 * 1000)
  return history
}

export async function fetchSizeSeries(
  packageName: string,
  publishDates: Record<string, string>
): Promise<{
  points: TrendsPoint[]
  latestGzip: number | null
  latestSize: number | null
}> {
  const history = await fetchHistory(packageName)

  const points: TrendsPoint[] = []

  for (const [version, snapshot] of Object.entries(history || {})) {
    const gzip = snapshot?.gzip
    if (typeof gzip !== 'number') {
      continue
    }

    const date = publishDates[version]
    if (!date) {
      continue
    }

    points.push({
      date,
      value: gzip,
      version,
    })
  }

  points.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return semver.compare(a.version || '0.0.0', b.version || '0.0.0')
  })
  const dailyPoints = Array.from(
    new Map(points.map(point => [point.date, point])).values()
  )

  const latest = dailyPoints[dailyPoints.length - 1]
  const latestMeta = latest?.version ? history[latest.version] : undefined

  return {
    points: dailyPoints,
    latestGzip: typeof latest?.value === 'number' ? latest.value : null,
    latestSize: typeof latestMeta?.size === 'number' ? latestMeta.size : null,
  }
}
