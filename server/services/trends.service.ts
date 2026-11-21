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
import {
  buildGithubStarTotals,
  dateForGithubDay,
  formatTrendsDate,
  startOfTrendsRangeDate,
} from '../../utils/trends'
import {
  fetchGithubStarCount,
  fetchGithubStarHistoryPage,
  type GithubStarHistoryRow,
} from '../clients/github.client'
import { fetchNpmDownloadRange } from '../clients/npm-downloads.client'
import { fetchPackageHistory } from './package-history.service'

export { buildGithubStarTotals }

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

  const normalized = points
    .filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.day))
    .map(point => ({ date: point.day, value: point.downloads }))

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
