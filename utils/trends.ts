import {
  addDays,
  format,
  isAfter,
  isValid,
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

export type GithubStarHistoryRow = {
  week: number
  total: number
  days: number[]
}

const MAX_NPM_RANGE_DAYS = 365

export function splitNpmDateRange(range: string): string[] {
  const match = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(range)

  if (!match) return [range]

  const start = parseISO(match[1])
  const end = parseISO(match[2])

  if (!isValid(start) || !isValid(end)) return [range]

  if (isAfter(start, end)) return [range]

  const ranges: string[] = []
  let chunkStart = start

  while (!isAfter(chunkStart, end)) {
    const proposedEnd = addDays(chunkStart, MAX_NPM_RANGE_DAYS - 1)
    const chunkEnd = isAfter(proposedEnd, end) ? end : proposedEnd

    ranges.push(
      `${format(chunkStart, 'yyyy-MM-dd')}:${format(chunkEnd, 'yyyy-MM-dd')}`,
    )

    chunkStart = addDays(chunkEnd, 1)
  }

  return ranges
}

export function dateForGithubDay(week: number, day: number): string | null {
  const weekStart = new Date(week * 1000)

  if (!Number.isFinite(weekStart.getTime())) return null

  // GitHub says day zero is Sunday but its week boundary may not align with
  // UTC. Normalize the epoch's UTC date to the nearest Sunday before applying
  // calendar arithmetic, independently of the server timezone.
  const utcDay = weekStart.getUTCDay()
  const daysToSunday = utcDay <= 3 ? -utcDay : 7 - utcDay
  const utcWeekStart = new Date(weekStart)
  utcWeekStart.setUTCDate(utcWeekStart.getUTCDate() + daysToSunday + day)

  return formatTrendsDate(utcWeekStart)
}

function githubGainsByDate(
  rows: GithubStarHistoryRow[],
  today: string,
): Map<string, number> {
  const gainsByDate = new Map<string, number>()

  for (const row of rows) {
    for (const [day, value] of row.days.entries()) {
      const date = dateForGithubDay(row.week, day)

      if (!date || date > today) continue

      gainsByDate.set(date, value)
    }
  }

  return gainsByDate
}

export function buildGithubStarTotals(
  rows: GithubStarHistoryRow[],
  current: number,
  options: { from: string; now?: Date },
): TrendsPoint[] {
  const { from, now = new Date() } = options
  const today = formatTrendsDate(now)
  const gainsByDate = githubGainsByDate(rows, today)

  // GitHub exposes created-star history but not historical unstars. Walking
  // backward from the active-star count produces the closest available total
  // history and guarantees that the latest point is authoritative.
  if (!gainsByDate.has(today)) gainsByDate.set(today, 0)

  const gains = [...gainsByDate]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date))

  const totals: TrendsPoint[] = []
  let total = current

  for (let index = gains.length - 1; index >= 0; index -= 1) {
    const gain = gains[index]

    totals.push({
      date: gain.date,
      value: Math.max(0, total),
      partial: gain.date === today,
    })
    total -= gain.value
  }

  return totals.reverse().filter(point => point.date >= from)
}

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
