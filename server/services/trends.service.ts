import type {
  PackageHistoryResponse,
  PackageHistoryVersion,
} from '../../types/package-history'
import type {
  TrendsGroupBy,
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'
import {
  fetchGithubRepository,
  fetchGithubStarHistoryPage,
  type GithubStarHistoryRow,
} from '../clients/github.client'
import { fetchNpmDownloadRange } from '../clients/npm-downloads.client'
import { fetchPackageHistory } from './package-history.service'

const MAX_GITHUB_HISTORY_PAGES = 100

const COMPLETE_CACHE_TTL_MS = 10 * 60 * 1000

const DEGRADED_CACHE_TTL_MS = 30 * 1000

type PackageTrendsSource = TrendsPackageSeries

type PackageTrendsCacheEntry = {
  expiresAt: number
  value: Promise<PackageTrendsSource>
}

const packageTrendsCache = new Map<string, PackageTrendsCacheEntry>()

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getTrendsRangeStart(
  range: TrendsRange,
  now = new Date(),
): string {
  const start = new Date(now)

  if (range === 'last-2-months') start.setUTCMonth(start.getUTCMonth() - 2)

  if (range === 'last-year') start.setUTCFullYear(start.getUTCFullYear() - 1)

  if (range === 'last-3-years') start.setUTCFullYear(start.getUTCFullYear() - 3)

  return isoDate(start)
}

export function getNpmTrendsRange(
  range: TrendsRange,
  now = new Date(),
): string {
  const end = isoDate(now)
  const start = getTrendsRangeStart(range, now)

  return `${start}:${end}`
}

function bucketDate(date: string, groupBy: TrendsGroupBy): string {
  const value = new Date(`${date}T00:00:00Z`)

  if (groupBy === 'month') {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`
  }

  if (groupBy === 'week') {
    const day = value.getUTCDay()
    value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day))
  }

  return isoDate(value)
}

export function rollupTrendsPoints(
  points: TrendsPoint[],
  groupBy: TrendsGroupBy,
  options: { mode: 'sum' | 'last'; now?: Date },
): TrendsPoint[] {
  const buckets = new Map<string, TrendsPoint[]>()
  const { mode, now = new Date() } = options
  const currentBucket = bucketDate(isoDate(now), groupBy)

  for (const point of points) {
    const key = bucketDate(point.date, groupBy)
    buckets.set(key, [...(buckets.get(key) ?? []), point])
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
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
  const date = new Date(week * 1000)

  if (!Number.isFinite(date.getTime())) return null

  date.setUTCDate(date.getUTCDate() + day)

  return isoDate(date)
}

function mapGithubRows(
  rows: GithubStarHistoryRow[],
  from: string,
): TrendsPoint[] {
  const today = isoDate(new Date())

  return rows
    .flatMap(row =>
      row.days.flatMap((value, day) => {
        const date = dateForGithubDay(row.week, day)

        if (!date || date < from || date > today) return []

        return [{ date, value, partial: date === today }]
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
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

  const metadata = await fetchGithubRepository(repository)

  return {
    points: mapGithubRows(rows, from),
    current: Number.isSafeInteger(metadata.stargazers_count)
      ? metadata.stargazers_count!
      : null,
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
): Promise<PackageTrendsSource> {
  const from = getTrendsRangeStart(range)

  const history = await fetchPackageHistory(packageName, {
    from,
    limit: 500,
  })

  const warnings: string[] = []

  const [downloadsResult, githubResult] = await Promise.allSettled([
    fetchDownloads(packageName, range),
    history.repository
      ? fetchGithubStars(history.repository, from)
      : Promise.resolve({ points: [], current: null }),
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

function removeExpiredPackageTrends(now: number): void {
  packageTrendsCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) packageTrendsCache.delete(key)
  })
}

function getPackageTrendsSource(
  packageName: string,
  range: TrendsRange,
): Promise<PackageTrendsSource> {
  const now = Date.now()
  const key = `${packageName}|${range}`

  removeExpiredPackageTrends(now)

  const cached = packageTrendsCache.get(key)

  if (cached) return cached.value

  const value = fetchPackageTrendsSource(packageName, range)

  packageTrendsCache.set(key, {
    // An in-flight source has no expiry so concurrent grouping requests always
    // share it. Every upstream client has its own timeout.
    expiresAt: Number.POSITIVE_INFINITY,
    value,
  })

  void value.then(
    source => {
      const entry = packageTrendsCache.get(key)

      if (entry?.value !== value) return

      entry.expiresAt =
        Date.now() +
        (source.warnings.length > 0
          ? DEGRADED_CACHE_TTL_MS
          : COMPLETE_CACHE_TTL_MS)
    },
    () => {
      if (packageTrendsCache.get(key)?.value === value)
        packageTrendsCache.delete(key)
    },
  )

  return value
}

export function groupPackageTrends(
  source: PackageTrendsSource,
  groupBy: TrendsGroupBy,
): TrendsPackageSeries {
  return {
    ...source,
    downloads: rollupTrendsPoints(source.downloads, groupBy, { mode: 'sum' }),
    stars: rollupTrendsPoints(source.stars, groupBy, { mode: 'sum' }),
    size: rollupTrendsPoints(source.size, groupBy, { mode: 'last' }),
  }
}

export async function buildTrendsResponse(
  packageNames: string[],
  range: TrendsRange,
  groupBy: TrendsGroupBy,
): Promise<TrendsResponse> {
  const packages = parsePackages(packageNames)

  const sources = await Promise.all(
    packages.map(packageName => getPackageTrendsSource(packageName, range)),
  )

  return {
    packages: sources.map(source => groupPackageTrends(source, groupBy)),
    range,
    groupBy,
    generatedAt: new Date().toISOString(),
  }
}
