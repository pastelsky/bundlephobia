import type { TrendsGroupBy, TrendsPoint, TrendsRange } from './types'

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function getTrendsRangeStart(range: TrendsRange) {
  const start = new Date()
  switch (range) {
    case 'last-2-months':
      start.setUTCMonth(start.getUTCMonth() - 2)
      break
    case 'last-year':
      start.setUTCFullYear(start.getUTCFullYear() - 1)
      break
    case 'last-3-years':
      start.setUTCFullYear(start.getUTCFullYear() - 3)
      break
  }
  return isoDate(start)
}

export function resolveNpmDownloadRange(range: TrendsRange): string {
  const end = new Date()
  const start = new Date(end)

  switch (range) {
    case 'last-2-months':
      start.setUTCMonth(start.getUTCMonth() - 2)
      return `${isoDate(start)}:${isoDate(end)}`
    case 'last-year':
      return 'last-year'
    case 'last-3-years':
      start.setUTCFullYear(start.getUTCFullYear() - 3)
      return `${isoDate(start)}:${isoDate(end)}`
    default:
      return 'last-year'
  }
}

export function isTrendsRange(value: string | undefined): value is TrendsRange {
  return (
    value === 'last-2-months' ||
    value === 'last-year' ||
    value === 'last-3-years'
  )
}

export function isTrendsGroupBy(
  value: string | undefined
): value is TrendsGroupBy {
  return value === 'day' || value === 'week' || value === 'month'
}

function bucketDate(date: string, groupBy: TrendsGroupBy) {
  const value = new Date(`${date}T00:00:00Z`)
  if (groupBy === 'month') {
    return `${value.getUTCFullYear()}-${String(
      value.getUTCMonth() + 1
    ).padStart(2, '0')}-01`
  }
  if (groupBy === 'week') {
    const day = value.getUTCDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    value.setUTCDate(value.getUTCDate() + mondayOffset)
  }
  return isoDate(value)
}

export function rollupPoints(
  points: TrendsPoint[],
  groupBy: TrendsGroupBy,
  mode: 'sum' | 'last'
) {
  if (groupBy === 'day' && mode === 'last') return points

  const buckets = new Map<string, TrendsPoint[]>()
  points.forEach(point => {
    const key = bucketDate(point.date, groupBy)
    const bucket = buckets.get(key) || []
    bucket.push(point)
    buckets.set(key, bucket)
  })

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      const last = bucket[bucket.length - 1]
      const isCurrentBucket =
        groupBy !== 'day' && date === bucketDate(isoDate(new Date()), groupBy)
      return {
        date,
        value:
          mode === 'sum'
            ? bucket.reduce((total, point) => total + point.value, 0)
            : last.value,
        version: last.version,
        partial: bucket.some(point => point.partial) || isCurrentBucket,
      }
    })
}

export function filterPointsByRange(
  points: TrendsPoint[],
  range: TrendsRange
): TrendsPoint[] {
  if (!points || points.length === 0) return []

  const cutoffStr = getTrendsRangeStart(range)
  return points.filter(p => p.date >= cutoffStr)
}
