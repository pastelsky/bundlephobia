import axios from 'axios'

import { getCached, setCached } from './memoryCache'
import type { TrendsPoint, TrendsRange } from './types'
import { resolveNpmDownloadRange } from './range'

type NpmRangeResponse = {
  downloads: Array<{ day: string; downloads: number }>
  start?: string
  end?: string
  package?: string
}

type DownloadResult = {
  points: TrendsPoint[]
  weeklyDownloads: number | null
  warning?: string
}

function encodedPackageName(packageName: string) {
  return packageName
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getRangeStart(range: TrendsRange) {
  const start = new Date()
  if (range === 'last-2-months') {
    start.setUTCMonth(start.getUTCMonth() - 2)
  } else if (range === 'last-year') {
    start.setUTCFullYear(start.getUTCFullYear() - 1)
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 3)
  }
  return start
}

function getHistoricalBuckets(range: TrendsRange) {
  const start = getRangeStart(range)
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
  const cached = getCached<number | null>(cacheKey)
  if (cached !== undefined) return cached

  try {
    const { data } = await axios.get<NpmRangeResponse>(
      `https://api.npmjs.org/downloads/range/last-month/${encodedPackageName(
        packageName
      )}`,
      { timeout: 15_000 }
    )
    const lastSeven = (data.downloads || []).slice(-7)
    const weekly = lastSeven.length
      ? lastSeven.reduce((sum, point) => sum + point.downloads, 0)
      : null
    setCached(cacheKey, weekly, 6 * 60 * 60 * 1000)
    return weekly
  } catch {
    setCached(cacheKey, null, 15 * 60 * 1000)
    return null
  }
}

async function fetchHistoricalRange(
  packageName: string,
  bucket: { start: string; end: string }
) {
  const cacheKey = `downloads-range:${packageName}:${bucket.start}:${bucket.end}`
  const cached = getCached<TrendsPoint[]>(cacheKey)
  if (cached !== undefined) return cached

  try {
    const { data } = await axios.get<NpmRangeResponse>(
      `https://api.npmjs.org/downloads/range/${bucket.start}:${
        bucket.end
      }/${encodedPackageName(packageName)}`,
      { timeout: 15_000 }
    )
    const today = isoDate(new Date())
    const points = (data.downloads || []).map(point => ({
      date: point.day,
      value: point.downloads,
      partial: point.day === today,
    }))
    setCached(cacheKey, points, 24 * 60 * 60 * 1000)
    return points
  } catch {
    setCached(cacheKey, [], 15 * 60 * 1000)
    return []
  }
}

export async function fetchDownloadSeries(
  packageName: string,
  range: TrendsRange
): Promise<DownloadResult> {
  const cacheKey = `downloads:v3:${packageName}:${range}`
  const cached = getCached<DownloadResult>(cacheKey)
  if (cached) return cached

  if (range !== 'last-3-years') {
    const npmRange = resolveNpmDownloadRange(range)
    const { data } = await axios.get<NpmRangeResponse>(
      `https://api.npmjs.org/downloads/range/${npmRange}/${encodedPackageName(
        packageName
      )}`,
      { timeout: 15_000 }
    )
    const today = isoDate(new Date())
    const points = (data.downloads || []).map(point => ({
      date: point.day,
      value: point.downloads,
      partial: point.day === today,
    }))
    const lastSeven = points.slice(-7)
    const weeklyDownloads = lastSeven.length
      ? lastSeven.reduce((sum, point) => sum + point.value, 0)
      : null
    const result = { points, weeklyDownloads }
    setCached(cacheKey, result, 6 * 60 * 60 * 1000)
    return result
  }

  const buckets = getHistoricalBuckets(range)
  const historicalRanges = await Promise.all(
    buckets.map(bucket => fetchHistoricalRange(packageName, bucket))
  )
  const points = historicalRanges.flat()
  const warning = historicalRanges.some(bucket => bucket.length === 0)
    ? `Download history is incomplete: ${
        historicalRanges.filter(bucket => bucket.length > 0).length
      } of ${buckets.length} historical periods were available.`
    : 'Three-year downloads are assembled from six-month npm API windows.'
  const result = {
    points,
    weeklyDownloads: await fetchWeeklyDownloads(packageName),
    warning,
  }
  setCached(cacheKey, result, 6 * 60 * 60 * 1000)
  return result
}
