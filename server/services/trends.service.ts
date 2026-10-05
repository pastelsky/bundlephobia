import type {
  PackageHistoryResponse,
  PackageHistoryVersion,
} from '../../types/package-history'
import type {
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'
import { formatTrendsDate, startOfTrendsRangeDate } from '../../utils/trends'
import {
  fetchGithubStarCount,
  fetchGithubStarHistoryPage,
  type GithubStarHistoryRow,
} from '../clients/github.client'
import { fetchNpmDownloadRange } from '../clients/npm-downloads.client'
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

  const [[downloadsResult], [githubResult]] = await Promise.all([
    downloadsResults,
    Promise.allSettled([
      history.repository
        ? fetchGithubStars(history.repository, from)
        : Promise.resolve({ points: [], current: null }),
    ]),
  ])

  const downloads = getSettledDownloads(downloadsResult, warnings)
  const github = getSettledGithub(githubResult, warnings)

  const size = sizePoints(history)
  const latest = latestBuiltVersion(history.versions)

  return {
    name: packageName,
    repository: history.repository,
    downloads,
    stars: github.points,
    size,
    releases: history.releases.map(release => ({
      version: release.version,
      date: release.publishedAt,
      major: release.major,
      minor: release.minor,
    })),
    current: {
      weeklyDownloads:
        downloads.length > 0
          ? downloads.slice(-7).reduce((total, point) => total + point.value, 0)
          : null,
      stars: github.current,
      size: latest?.size ?? null,
      gzip: latest?.gzip ?? null,
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
