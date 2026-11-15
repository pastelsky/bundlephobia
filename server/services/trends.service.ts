import type {
  PackageHistoryResponse,
  PackageHistoryVersion,
} from '../../types/package-history'
import type {
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
  TrendsResponse,
  TrendsVulnerabilitySummary,
} from '@bundlephobia/service-contracts/trends'
import { formatTrendsDate, startOfTrendsRangeDate } from '../../utils/trends'
import {
  fetchGithubStarCount,
  fetchGithubStarHistoryPage,
  type GithubStarHistoryRow,
} from '../clients/github.client'
import { fetchNpmDownloadRange } from '../clients/npm-downloads.client'
import {
  fetchPackageVulnerabilities,
  type OsvRange,
  type OsvVulnerability,
} from '../clients/osv.client'
import { fetchPackageHistory } from './package-history.service'

const MAX_GITHUB_HISTORY_PAGES = 100

const COMPLETE_CACHE_TTL_MS = 10 * 60 * 1000

const DEGRADED_CACHE_TTL_MS = 30 * 1000

const MAX_CACHED_PACKAGE_RANGES = 250

interface LruCache<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V, maxAge?: number): this
}

interface LruCacheConstructor {
  new <K, V>(options: { max: number; maxAge: number }): LruCache<K, V>
}

// SAFETY: the pinned lru-cache package uses this constructor and set contract.
const LRU = require('lru-cache') as LruCacheConstructor

const packageTrendsCache = new LRU<string, TrendsPackageSeries>({
  max: MAX_CACHED_PACKAGE_RANGES,
  maxAge: COMPLETE_CACHE_TTL_MS,
})

const packageTrendsRequests = new Map<string, Promise<TrendsPackageSeries>>()

function isoDate(date: Date): string {
  return formatTrendsDate(date)
}

export function getTrendsRangeStart(
  range: TrendsRange,
  now = new Date(),
): string {
  return startOfTrendsRangeDate(range, now)
}

export function getNpmTrendsRange(
  range: TrendsRange,
  now = new Date(),
): string {
  const end = isoDate(now)
  const start = getTrendsRangeStart(range, now)

  return `${start}:${end}`
}

function parsePackages(packages: string[]): string[] {
  return [
    ...new Set(
      packages.flatMap(packageName => {
        const trimmed = packageName.trim()

        return trimmed ? trimmed.split(',').map(part => part.trim()) : []
      }),
    ),
  ].filter(Boolean)
}

function dateForGithubDay(week: number, day: number): string | null {
  const weekStart = new Date(week * 1000)

  if (!Number.isFinite(weekStart.getTime())) return null

  // GitHub says day zero is Sunday but its week boundary may not align with
  // UTC. Normalize the epoch's UTC date to the nearest Sunday before applying
  // calendar arithmetic, independently of the server timezone.
  const utcDay = weekStart.getUTCDay()
  const daysToSunday = utcDay <= 3 ? -utcDay : 7 - utcDay
  const utcWeekStart = new Date(weekStart)
  utcWeekStart.setUTCDate(utcWeekStart.getUTCDate() + daysToSunday + day)

  return isoDate(utcWeekStart)
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
  const today = isoDate(now)
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

type GithubHistoryCursor = {
  page: number
  lastPage: number | null
  from: string
}

function shouldStopGithubHistory(
  rows: GithubStarHistoryRow[],
  cursor: GithubHistoryCursor,
): boolean {
  if (rows.length === 0) return true

  const oldestRow = rows.at(-1)
  const oldestDate = oldestRow ? dateForGithubDay(oldestRow.week, 0) : null

  return Boolean(
    (oldestDate !== null && oldestDate <= cursor.from) ||
    (cursor.lastPage !== null && cursor.page >= cursor.lastPage) ||
    (cursor.lastPage === null && rows.length < 30),
  )
}

async function fetchGithubStars(
  repository: string,
  from: string,
): Promise<{ points: TrendsPoint[]; current: number | null }> {
  const rows: GithubStarHistoryRow[] = []
  let page = 1
  let lastPage: number | null = null

  while (page <= MAX_GITHUB_HISTORY_PAGES) {
    const result = await fetchGithubStarHistoryPage(repository, page)
    rows.push(...result.rows)
    lastPage = result.lastPage

    if (shouldStopGithubHistory(result.rows, { page, lastPage, from })) break

    page += 1
  }

  const current = await fetchGithubStarCount(repository)

  return {
    points: buildGithubStarTotals(rows, current, { from }),
    current,
  }
}

async function fetchDownloads(
  packageName: string,
  range: TrendsRange,
): Promise<TrendsPoint[]> {
  const points = await fetchNpmDownloadRange(
    packageName,
    getNpmTrendsRange(range),
  )

  return points
    .filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.day))
    .map(point => ({ date: point.day, value: point.downloads }))
}

function sizePoints(history: PackageHistoryResponse): TrendsPoint[] {
  return history.versions.flatMap(version => {
    if (!version.publishedAt || version.gzip === null) return []

    return [
      {
        date: version.publishedAt,
        value: version.gzip,
        version: version.version,
      },
    ]
  })
}

function latestBuiltVersion(
  versions: PackageHistoryVersion[],
): PackageHistoryVersion | undefined {
  return [...versions]
    .filter(version => version.gzip !== null || version.size !== null)
    .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
    .at(-1)
}

function getSettledDownloads(
  result: PromiseSettledResult<TrendsPoint[]>,
  warnings: string[],
): TrendsPoint[] {
  if (result.status === 'fulfilled') return result.value

  warnings.push('npm download history is unavailable')

  return []
}

type GithubTrendResult = { points: TrendsPoint[]; current: number | null }

function getSettledGithub(
  result: PromiseSettledResult<GithubTrendResult>,
  warnings: string[],
): GithubTrendResult {
  if (result.status === 'fulfilled') return result.value

  warnings.push('GitHub star history is unavailable')

  return { points: [], current: null }
}

export type VulnerabilityTrendsResult = {
  points: TrendsPoint[]
  summary: TrendsVulnerabilitySummary
}

export type VulnerabilityInterval = {
  id: string
  openedAt: string
  resolvedAt: string | null
}

const SEVERITY_MAP = new Map<
  string,
  keyof Omit<TrendsVulnerabilitySummary, 'total' | 'active'>
>([
  ['CRITICAL', 'critical'],
  ['HIGH', 'high'],
  ['MODERATE', 'moderate'],
  ['MEDIUM', 'moderate'],
  ['LOW', 'low'],
])

export function summarizeVulnerabilities(
  vulns: OsvVulnerability[],
): TrendsVulnerabilitySummary {
  const summary: TrendsVulnerabilitySummary = {
    total: vulns.length,
    active: 0,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  }

  for (const v of vulns) {
    const rawSev = (v.database_specific?.severity ?? '').toUpperCase()

    const key = SEVERITY_MAP.get(rawSev)

    if (key) {
      summary[key] += 1
    }
  }

  return summary
}

function addDaysToIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)

  return d.toISOString().slice(0, 10)
}

function getRangeFixes(range: OsvRange): string[] {
  const fixes: string[] = []

  for (const ev of range.events ?? []) {
    if (ev.fixed) {
      fixes.push(ev.fixed)
    }
  }

  return fixes
}

function matchesPackage(affPkgName?: string, targetPkgName?: string): boolean {
  if (!targetPkgName || !affPkgName) return true

  return affPkgName.toLowerCase() === targetPkgName.toLowerCase()
}

function findFixVersions(
  vuln: OsvVulnerability,
  packageName?: string,
): string[] {
  const fixes: string[] = []

  for (const aff of vuln.affected ?? []) {
    if (matchesPackage(aff.package?.name, packageName)) {
      for (const range of aff.ranges ?? []) {
        fixes.push(...getRangeFixes(range))
      }
    }
  }

  return fixes
}

function resolveInterval(
  openedAt: string,
  fixVersions: string[],
  publishDates: Record<string, string>,
): string | null {
  const fixDates = fixVersions
    .flatMap(ver => {
      const date = publishDates[ver]

      return date ? [date] : []
    })
    .sort()

  const fixDate = fixDates[0]

  if (!fixDate) {
    return null
  }

  if (fixDate > openedAt) {
    return fixDate
  }

  return addDaysToIso(openedAt, 7)
}

export function toVulnerabilityInterval(
  vuln: OsvVulnerability,
  packageName: string | undefined,
  publishDates: Record<string, string>,
): VulnerabilityInterval {
  const openedAt = vuln.published.slice(0, 10)
  const fixVersions = findFixVersions(vuln, packageName)
  const resolvedAt = resolveInterval(openedAt, fixVersions, publishDates)

  return { id: vuln.id, openedAt, resolvedAt }
}

export function countActiveVulnerabilities(
  intervals: VulnerabilityInterval[],
  date: string,
): number {
  let count = 0

  for (const iv of intervals) {
    if (iv.openedAt <= date && (!iv.resolvedAt || iv.resolvedAt > date)) {
      count += 1
    }
  }

  return count
}

function buildDailyActiveTimeline(
  intervals: VulnerabilityInterval[],
  from: string,
  today: string,
): TrendsPoint[] {
  const points: TrendsPoint[] = []
  const cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${today}T00:00:00Z`)

  while (cur <= end) {
    const dStr = cur.toISOString().slice(0, 10)
    const active = countActiveVulnerabilities(intervals, dStr)

    points.push({ date: dStr, value: active })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  return points
}

export type BuildVulnerabilityOptions = {
  packageName?: string
  publishDates?: Record<string, string>
}

export function buildVulnerabilityPoints(
  vulns: OsvVulnerability[],
  from: string,
  options: BuildVulnerabilityOptions = {},
): VulnerabilityTrendsResult {
  const { packageName, publishDates = {} } = options
  const summary = summarizeVulnerabilities(vulns)
  const today = formatTrendsDate(new Date())

  if (vulns.length === 0) {
    const emptyResult: VulnerabilityTrendsResult = {
      points: [
        { date: from, value: 0 },
        { date: today, value: 0 },
      ],
      summary,
    }

    return emptyResult
  }

  const intervals = vulns.map(v =>
    toVulnerabilityInterval(v, packageName, publishDates),
  )

  summary.active = countActiveVulnerabilities(intervals, today)

  const points = buildDailyActiveTimeline(intervals, from, today)
  const result: VulnerabilityTrendsResult = { points, summary }

  return result
}

function weeklyDownloadsTotal(downloads: TrendsPoint[]): number | null {
  if (downloads.length === 0) return null

  return downloads.slice(-7).reduce((total, point) => total + point.value, 0)
}

async function fetchPackageTrendsSource(
  packageName: string,
  range: TrendsRange,
): Promise<TrendsPackageSeries> {
  const from = getTrendsRangeStart(range)

  // npm downloads do not depend on the package's release history or repository.
  // Attach a rejection handler immediately while the history request is pending.
  const downloadsResults = Promise.allSettled([
    fetchDownloads(packageName, range),
  ])

  const history = await fetchPackageHistory(packageName, {
    from,
    limit: 500,
  })

  const warnings: string[] = []

  const [[downloadsResult], [githubResult], [vulnsResult]] = await Promise.all([
    downloadsResults,
    Promise.allSettled([
      history.repository
        ? fetchGithubStars(history.repository, from)
        : Promise.resolve({ points: [], current: null }),
    ]),
    Promise.allSettled([fetchPackageVulnerabilities(packageName)]),
  ])

  const downloads = getSettledDownloads(downloadsResult, warnings)
  const github = getSettledGithub(githubResult, warnings)

  const vulns = vulnsResult.status === 'fulfilled' ? vulnsResult.value : []

  const { points: vulnerabilities, summary: vulnerabilitySummary } =
    buildVulnerabilityPoints(vulns, from, {
      packageName,
      publishDates: history.publishDates ?? {},
    })

  const size = sizePoints(history)
  const latest = latestBuiltVersion(history.versions)

  return {
    name: packageName,
    repository: history.repository,
    downloads,
    stars: github.points,
    size,
    vulnerabilities,
    releases: history.releases.map(release => ({
      version: release.version,
      date: release.publishedAt,
      major: release.major,
      minor: release.minor,
    })),
    current: {
      weeklyDownloads: weeklyDownloadsTotal(downloads),
      stars: github.current,
      size: latest?.size ?? null,
      gzip: latest?.gzip ?? null,
      vulnerabilities: vulnerabilitySummary,
    },
    warnings,
  }
}

function getPackageTrendsSource(
  packageName: string,
  range: TrendsRange,
): Promise<TrendsPackageSeries> {
  const key = `${packageName}|${range}`
  const cached = packageTrendsCache.get(key)

  if (cached) return Promise.resolve(cached)

  const pending = packageTrendsRequests.get(key)

  if (pending) return pending

  const request = fetchPackageTrendsSource(packageName, range)
    .then(source => {
      const ttl =
        source.warnings.length > 0
          ? DEGRADED_CACHE_TTL_MS
          : COMPLETE_CACHE_TTL_MS

      packageTrendsCache.set(key, source, ttl)

      return source
    })
    .finally(() => packageTrendsRequests.delete(key))

  packageTrendsRequests.set(key, request)

  return request
}

export async function buildTrendsResponse(
  packageNames: string[],
  range: TrendsRange,
): Promise<TrendsResponse> {
  const packages = parsePackages(packageNames)

  const sources = await Promise.all(
    packages.map(packageName => getPackageTrendsSource(packageName, range)),
  )

  return {
    packages: sources,
    range,
    generatedAt: new Date().toISOString(),
  }
}
