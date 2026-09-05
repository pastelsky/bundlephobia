import semver from 'semver'

import firebaseUtils from '../../../utils/firebase.utils'
import { getOrLoadTrendsData } from '../cache'
import { trendsConfig } from '../config'
import type { TrendsPoint } from '../types'

type HistorySnapshot = {
  size?: number
  gzip?: number
  version?: string
}

async function fetchHistory(packageName: string) {
  const history = (await firebaseUtils.getPackageHistory(
    packageName,
    40,
  )) as Record<string, HistorySnapshot> | null
  return history || {}
}

export async function fetchSizeSeries(
  packageName: string,
  publishDates: Record<string, string>,
): Promise<{
  points: TrendsPoint[]
  latestGzip: number | null
  latestSize: number | null
}> {
  return getOrLoadTrendsData(
    'size-history',
    `size-series:${packageName}`,
    trendsConfig.cacheTtlMs.sizeHistory,
    async () => {
      const history = await fetchHistory(packageName)
      const points: TrendsPoint[] = []

      for (const [version, snapshot] of Object.entries(history)) {
        const gzip = snapshot?.gzip
        if (typeof gzip !== 'number') continue

        const date = publishDates[version]
        if (!date) continue

        points.push({ date, value: gzip, version })
      }

      points.sort((a, b) => {
        const byDate = a.date.localeCompare(b.date)
        if (byDate !== 0) return byDate
        return semver.compare(a.version || '0.0.0', b.version || '0.0.0')
      })
      const dailyPoints = Array.from(
        new Map(points.map(point => [point.date, point])).values(),
      )

      const latest = dailyPoints[dailyPoints.length - 1]
      const latestMeta = latest?.version ? history[latest.version] : undefined

      return {
        points: dailyPoints,
        latestGzip: typeof latest?.value === 'number' ? latest.value : null,
        latestSize:
          typeof latestMeta?.size === 'number' ? latestMeta.size : null,
      }
    },
  )
}
