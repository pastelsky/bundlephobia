import {
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from 'date-fns'

import type {
  TrendsGroupBy,
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
} from '@bundlephobia/service-contracts/trends'

export function formatTrendsDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function startOfTrendsRange(range: TrendsRange, now = new Date()): Date {
  return range === 'last-2-months'
    ? subMonths(now, 2)
    : subYears(now, range === 'last-year' ? 1 : 3)
}

export function startOfTrendsRangeDate(
  range: TrendsRange,
  now = new Date(),
): string {
  // Apply date-fns calendar clamping to the UTC calendar day, represented at
  // local noon so host timezone and DST cannot move it across a date boundary.
  const utcCalendarDay = new Date(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    12,
  )

  return format(startOfTrendsRange(range, utcCalendarDay), 'yyyy-MM-dd')
}

function bucketDate(date: string, groupBy: TrendsGroupBy): string {
  const value = parseISO(date)

  if (groupBy === 'month') return format(startOfMonth(value), 'yyyy-MM-dd')

  if (groupBy === 'week')
    return format(startOfWeek(value, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  return date
}

export function rollupTrendsPoints(
  points: TrendsPoint[],
  groupBy: TrendsGroupBy,
  options: { mode: 'sum' | 'last'; now?: Date },
): TrendsPoint[] {
  const { mode, now = new Date() } = options
  const currentBucket = bucketDate(formatTrendsDate(now), groupBy)
  const buckets = new Map<string, TrendsPoint[]>()

  for (const point of points) {
    const date = bucketDate(point.date, groupBy)
    const bucket = buckets.get(date)

    if (bucket) bucket.push(point)
    else buckets.set(date, [point])
  }

  return [...buckets]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => {
      const last = bucket.reduce((latest, point) =>
        point.date > latest.date ? point : latest,
      )

      return {
        date,
        value:
          mode === 'sum'
            ? bucket.reduce((total, point) => total + point.value, 0)
            : last.value,
        version: last.version,
        partial:
          bucket.some(point => point.partial) ||
          (mode === 'sum' && date === currentBucket),
      }
    })
}

export function groupTrendsPackage(
  source: TrendsPackageSeries,
  groupBy: TrendsGroupBy,
): TrendsPackageSeries {
  return {
    ...source,
    downloads: rollupTrendsPoints(source.downloads, groupBy, { mode: 'sum' }),
    stars: rollupTrendsPoints(source.stars, groupBy, { mode: 'last' }),
    size: rollupTrendsPoints(source.size, groupBy, { mode: 'last' }),
  }
}
