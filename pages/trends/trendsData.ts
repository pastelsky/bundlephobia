import { format, parseISO, startOfMonth, startOfWeek } from 'date-fns'

import type {
  TrendsGroupBy,
  TrendsPackageSeries,
  TrendsPoint,
} from '@bundlephobia/service-contracts/trends'

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
  const currentBucket = bucketDate(format(now, 'yyyy-MM-dd'), groupBy)
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
      const last = bucket.at(-1)!

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
    stars: rollupTrendsPoints(source.stars, groupBy, { mode: 'sum' }),
    size: rollupTrendsPoints(source.size, groupBy, { mode: 'last' }),
  }
}
