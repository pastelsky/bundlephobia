import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from 'date-fns'

import {
  TRENDS_VULNERABILITY_SEVERITIES,
  type TrendsGroupBy,
  type TrendsPackageSeries,
  type TrendsPoint,
  type TrendsRange,
  type TrendsVulnerabilityAdvisory,
  type TrendsVulnerabilitySeverity,
} from '@bundlephobia/service-contracts/trends'

export type GithubStarHistoryRow = {
  week: number
  total: number
  days: number[]
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

function computeBucketValue(
  bucket: TrendsPoint[],
  last: TrendsPoint,
  mode: 'sum' | 'last' | 'max',
): number {
  if (mode === 'sum') {
    return bucket.reduce((total, point) => total + point.value, 0)
  }

  if (mode === 'max') {
    return Math.max(...bucket.map(point => point.value))
  }

  return last.value
}

export function rollupTrendsPoints(
  points: TrendsPoint[],
  groupBy: TrendsGroupBy,
  options: { mode: 'sum' | 'last' | 'max'; now?: Date },
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
        value: computeBucketValue(bucket, last, mode),
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
    vulnerabilities: rollupTrendsPoints(source.vulnerabilities ?? [], groupBy, {
      mode: 'max',
    }),
  }
}

const SEVERITY_ORDER: Record<TrendsVulnerabilitySeverity | 'unknown', number> =
  {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 3,
    unknown: 4,
  }

export type BucketVulnerabilityDetails = {
  date: string
  count: number
  bySeverity: Record<TrendsVulnerabilitySeverity, number>
  advisories: TrendsVulnerabilityAdvisory[]
}

export function isAdvisoryActiveOnDate(
  advisory: TrendsVulnerabilityAdvisory,
  date: string,
): boolean {
  return advisory.windows.some(
    win => win.from <= date && (win.to === null || win.to > date),
  )
}

function advisoryMatchesFilter(
  advisory: TrendsVulnerabilityAdvisory,
  enabledSeverities: ReadonlySet<TrendsVulnerabilitySeverity>,
): boolean {
  if (enabledSeverities.size === TRENDS_VULNERABILITY_SEVERITIES.length) {
    return true
  }

  return (
    advisory.severity !== 'unknown' && enabledSeverities.has(advisory.severity)
  )
}

function countBySeverity(
  advisories: TrendsVulnerabilityAdvisory[],
): Record<TrendsVulnerabilitySeverity, number> {
  const counts: Record<TrendsVulnerabilitySeverity, number> = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  }

  for (const advisory of advisories) {
    if (advisory.severity !== 'unknown') {
      counts[advisory.severity] += 1
    }
  }

  return counts
}

export function filterPackageVulnerabilities(
  pack: TrendsPackageSeries,
  enabledSeverities: ReadonlySet<TrendsVulnerabilitySeverity>,
): TrendsPackageSeries {
  if (
    !pack.advisories ||
    enabledSeverities.size === TRENDS_VULNERABILITY_SEVERITIES.length
  ) {
    return pack
  }

  const matchingAdvisories = pack.advisories.filter(advisory =>
    advisoryMatchesFilter(advisory, enabledSeverities),
  )

  const vulnerabilities = (pack.vulnerabilities ?? []).map(point => ({
    ...point,
    value: matchingAdvisories.filter(adv =>
      isAdvisoryActiveOnDate(adv, point.date),
    ).length,
  }))

  const latestDate =
    vulnerabilities.at(-1)?.date ?? formatTrendsDate(new Date())

  const activeToday = matchingAdvisories.filter(adv =>
    isAdvisoryActiveOnDate(adv, latestDate),
  )

  const severityCounts = countBySeverity(activeToday)

  return {
    ...pack,
    vulnerabilities,
    current: {
      ...pack.current,
      vulnerabilities: pack.current.vulnerabilities
        ? {
            total: pack.current.vulnerabilities.total,
            active: activeToday.length,
            ...severityCounts,
          }
        : null,
    },
  }
}

type DateBounds = { start: string; end: string }

type PeakDateMatch = {
  peakDate: string
  activeOnPeak: TrendsVulnerabilityAdvisory[]
}

function bucketBounds(timestamp: number, groupBy: TrendsGroupBy): DateBounds {
  const day = formatTrendsDate(new Date(timestamp))
  const parsed = parseISO(day)

  if (groupBy === 'month') {
    return {
      start: format(startOfMonth(parsed), 'yyyy-MM-dd'),
      end: format(endOfMonth(parsed), 'yyyy-MM-dd'),
    }
  }

  if (groupBy === 'week') {
    return {
      start: format(startOfWeek(parsed, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      end: format(endOfWeek(parsed, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    }
  }

  return { start: day, end: day }
}

function clipBucketBounds(
  bounds: DateBounds,
  points: TrendsPoint[],
): DateBounds {
  const firstPoint = points[0]?.date
  const lastPoint = points.at(-1)?.date

  return {
    start: firstPoint && bounds.start < firstPoint ? firstPoint : bounds.start,
    end: lastPoint && bounds.end > lastPoint ? lastPoint : bounds.end,
  }
}

function pickPeakDate(
  advisories: TrendsVulnerabilityAdvisory[],
  start: string,
  end: string,
): PeakDateMatch {
  let peakDate = start
  let activeOnPeak: TrendsVulnerabilityAdvisory[] = []
  let cursor = parseISO(start)
  const endDate = parseISO(end)

  while (!isAfter(cursor, endDate)) {
    const dayStr = format(cursor, 'yyyy-MM-dd')
    const active = advisories.filter(adv => isAdvisoryActiveOnDate(adv, dayStr))

    if (dayStr === start || active.length > activeOnPeak.length) {
      peakDate = dayStr
      activeOnPeak = active
    }

    cursor = addDays(cursor, 1)
  }

  return { peakDate, activeOnPeak }
}

export function resolveBucketVulnerabilityDetails(
  pack: TrendsPackageSeries,
  options: {
    timestamp: number
    groupBy: TrendsGroupBy
    enabledSeverities: ReadonlySet<TrendsVulnerabilitySeverity>
  },
): BucketVulnerabilityDetails | null {
  if (!pack.advisories) return null

  const { start, end } = clipBucketBounds(
    bucketBounds(options.timestamp, options.groupBy),
    pack.vulnerabilities ?? [],
  )

  if (start > end) {
    return {
      date: start,
      count: 0,
      bySeverity: countBySeverity([]),
      advisories: [],
    }
  }

  const matching = pack.advisories.filter(adv =>
    advisoryMatchesFilter(adv, options.enabledSeverities),
  )

  const { peakDate, activeOnPeak } = pickPeakDate(matching, start, end)

  const sorted = [...activeOnPeak].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      (left.cve ?? left.id).localeCompare(right.cve ?? right.id),
  )

  return {
    date: peakDate,
    count: sorted.length,
    bySeverity: countBySeverity(sorted),
    advisories: sorted,
  }
}

export type NpmDownloadPoint = { day: string; downloads: number }

// The npm downloads API silently truncates large range requests to its
// retention window. Keep requests to one year so callers can retrieve longer
// histories by stitching together bounded ranges.
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

export function getNpmTrendsRange(
  range: TrendsRange,
  now = new Date(),
): string {
  const end = formatTrendsDate(now)
  const start = startOfTrendsRangeDate(range, now)

  return `${start}:${end}`
}

export function normalizeNpmDownloadPoints(
  points: NpmDownloadPoint[],
): TrendsPoint[] {
  const normalized = points.flatMap(point =>
    /^\d{4}-\d{2}-\d{2}$/.test(point.day)
      ? [{ date: point.day, value: point.downloads }]
      : [],
  )

  // npm's downloads range API returns 0 for trailing UTC days that have not yet
  // been aggregated; drop those unaggregated tail buckets when prior days exist.
  if (normalized.length > 1 && normalized.some(point => point.value > 0)) {
    let end = normalized.length

    while (end > 1 && normalized[end - 1].value === 0) {
      end -= 1
    }

    if (end < normalized.length) {
      return normalized.slice(0, end)
    }
  }

  return normalized
}

export function computeWeeklyDownloads(points: TrendsPoint[]): number | null {
  if (points.length === 0) return null

  return points.slice(-7).reduce((total, point) => total + point.value, 0)
}
