import {
  fetchNpmDownloadRange,
  type NpmDownloadPoint,
} from '../../clients/npmDownloads'
import { getOrLoadTrendsData } from '../cache'
import { trendsConfig } from '../config'
import { getTrendsRangeStart, resolveNpmDownloadRange } from '../range'
import type { TrendsPoint, TrendsRange } from '../types'

type DownloadResult = {
  points: TrendsPoint[]
  weeklyDownloads: number | null
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toTrendsPoints(downloads: NpmDownloadPoint[]): TrendsPoint[] {
  const today = isoDate(new Date())
  return downloads.map(point => ({
    date: point.day,
    value: point.downloads,
    partial: point.day === today,
  }))
}

function getHistoricalBuckets(range: TrendsRange) {
  const start = new Date(`${getTrendsRangeStart(range)}T00:00:00Z`)
  const end = new Date()
  const buckets: Array<{ start: string; end: string }> = []
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  )

  while (cursor <= end) {
    const bucketStart = new Date(cursor)
    const bucketEnd = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + trendsConfig.downloads.historicalWindowMonths,
        0
      )
    )
    buckets.push({
      start: isoDate(bucketStart < start ? start : bucketStart),
      end: isoDate(bucketEnd > end ? end : bucketEnd),
    })
    cursor.setUTCMonth(
      cursor.getUTCMonth() + trendsConfig.downloads.historicalWindowMonths
    )
  }

  return buckets
}

/** Retrieves one bounded historical window for the three-year series. */
async function fetchHistoricalRange(
  packageName: string,
  bucket: { start: string; end: string }
) {
  const cacheKey = `downloads-range:${packageName}:${bucket.start}:${bucket.end}`
  return getOrLoadTrendsData(
    'downloads',
    cacheKey,
    trendsConfig.cacheTtlMs.downloadWindow,
    async () => {
      try {
        const downloads = await fetchNpmDownloadRange(
          packageName,
          `${bucket.start}:${bucket.end}`
        )
        return toTrendsPoints(downloads)
      } catch {
        return []
      }
    }
  )
}

/**
 * Loads daily package downloads and sums the latest seven reported days.
 * The three-year API limit is handled by composing bounded source windows.
 */
export async function fetchDownloadSeries(
  packageName: string,
  range: TrendsRange
): Promise<DownloadResult> {
  const cacheKey = `series:${packageName}:${range}`
  return getOrLoadTrendsData(
    'downloads',
    cacheKey,
    trendsConfig.cacheTtlMs.downloads,
    async () => {
      if (range !== 'last-3-years') {
        const npmRange = resolveNpmDownloadRange(range)
        const downloads = await fetchNpmDownloadRange(packageName, npmRange)
        const points = toTrendsPoints(downloads)
        return {
          points,
          weeklyDownloads: sumLatestWeek(points),
        }
      }

      const buckets = getHistoricalBuckets(range)
      const historicalRanges = await Promise.all(
        buckets.map(bucket => fetchHistoricalRange(packageName, bucket))
      )
      const points = historicalRanges.flat()
      return {
        points,
        weeklyDownloads: sumLatestWeek(points),
      }
    }
  )
}

function sumLatestWeek(points: TrendsPoint[]): number | null {
  const latestWeek = points.slice(-trendsConfig.downloads.daysPerWeek)
  return latestWeek.length
    ? latestWeek.reduce((sum, point) => sum + point.value, 0)
    : null
}
