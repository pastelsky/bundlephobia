import { getOrLoadTrendsData } from '../cache'
import { fetchNpmDownloadRange } from '../clients/npmDownloads'
import { getTrendsRangeStart, resolveNpmDownloadRange } from '../range'
import type { TrendsPoint, TrendsRange } from '../types'

const DAYS_PER_WEEK = 7

type DownloadResult = {
  points: TrendsPoint[]
  weeklyDownloads: number | null
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
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
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 6, 0)
    )
    buckets.push({
      start: isoDate(bucketStart < start ? start : bucketStart),
      end: isoDate(bucketEnd > end ? end : bucketEnd),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 6)
  }

  return buckets
}

async function fetchWeeklyDownloads(packageName: string) {
  const cacheKey = `downloads-week:${packageName}`
  return getOrLoadTrendsData(
    'downloads',
    cacheKey,
    6 * 60 * 60 * 1000,
    async () => {
      try {
        const points = await fetchNpmDownloadRange(packageName, 'last-month')
        return sumLatestWeek(points)
      } catch {
        return null
      }
    }
  )
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
    24 * 60 * 60 * 1000,
    async () => {
      try {
        const downloads = await fetchNpmDownloadRange(
          packageName,
          `${bucket.start}:${bucket.end}`
        )
        const today = isoDate(new Date())
        return downloads.map(point => ({
          date: point.day,
          value: point.downloads,
          partial: point.day === today,
        }))
      } catch {
        return []
      }
    }
  )
}

/**
 * Loads daily package downloads and derives the latest complete seven-day sum.
 * The three-year API limit is handled by composing bounded source windows.
 */
export async function fetchDownloadSeries(
  packageName: string,
  range: TrendsRange
): Promise<DownloadResult> {
  const cacheKey = `downloads:v3:${packageName}:${range}`
  return getOrLoadTrendsData(
    'downloads',
    cacheKey,
    6 * 60 * 60 * 1000,
    async () => {
      if (range !== 'last-3-years') {
        const npmRange = resolveNpmDownloadRange(range)
        const downloads = await fetchNpmDownloadRange(packageName, npmRange)
        const today = isoDate(new Date())
        const points = downloads.map(point => ({
          date: point.day,
          value: point.downloads,
          partial: point.day === today,
        }))
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
        weeklyDownloads: await fetchWeeklyDownloads(packageName),
      }
    }
  )
}

function sumLatestWeek(
  points: Array<{ downloads: number }> | TrendsPoint[]
): number | null {
  const latestWeek = points.slice(-DAYS_PER_WEEK)
  return latestWeek.length
    ? latestWeek.reduce(
        (sum, point) =>
          sum + ('downloads' in point ? point.downloads : point.value),
        0
      )
    : null
}
