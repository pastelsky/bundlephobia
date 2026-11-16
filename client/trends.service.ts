/* eslint-disable max-params, complexity, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion */

import type {
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'
import type { PackageHistoryResponse } from '../types/package-history'
import {
  buildGithubStarTotals,
  dateForGithubDay,
  formatTrendsDate,
  splitNpmDateRange,
  startOfTrendsRangeDate,
  type GithubStarHistoryRow,
} from '../utils/trends'
import API from './api'

type CachedSeries = {
  series: TrendsPackageSeries
  expiresAt: number
}

const clientTrendsCache = new Map<string, CachedSeries>()

const COMPLETE_CACHE_TTL_MS = 10 * 60 * 1000

const DEGRADED_CACHE_TTL_MS = 30 * 1000

export function clearClientTrendsCache(): void {
  clientTrendsCache.clear()
}

export function getCachedTrendsSeries(
  packageName: string,
  range: TrendsRange,
  now = Date.now(),
): TrendsPackageSeries | null {
  const cached = clientTrendsCache.get(`${packageName}:${range}`)

  if (cached && cached.expiresAt > now) {
    return cached.series
  }

  return null
}

export function setCachedTrendsSeries(
  packageName: string,
  range: TrendsRange,
  series: TrendsPackageSeries,
  now = Date.now(),
): void {
  const ttl =
    series.warnings.length > 0 ? DEGRADED_CACHE_TTL_MS : COMPLETE_CACHE_TTL_MS

  clientTrendsCache.set(`${packageName}:${range}`, {
    series,
    expiresAt: now + ttl,
  })
}

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
}

export async function fetchNpmDownloads(
  packageName: string,
  range: TrendsRange,
  fetchImpl: typeof fetch = typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : fetch,
): Promise<TrendsPoint[]> {
  const now = new Date()
  const start = startOfTrendsRangeDate(range, now)
  const end = formatTrendsDate(now)
  const ranges = splitNpmDateRange(`${start}:${end}`)
  const encodedName = encodeURIComponent(packageName).replace(/^%40/, '@')
  const pointsByDay = new Map<string, TrendsPoint>()

  for (const chunk of ranges) {
    const response = await fetchImpl(
      `https://api.npmjs.org/downloads/range/${chunk}/${encodedName}`,
    )

    if (!response.ok) {
      throw new Error(`npm downloads failed: ${response.status}`)
    }

    const data = (await response.json()) as {
      downloads?: Array<{ day: string; downloads: number }>
    }

    for (const point of data.downloads || []) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(point.day)) {
        pointsByDay.set(point.day, { date: point.day, value: point.downloads })
      }
    }
  }

  return [...pointsByDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchGithubStarCount(
  repository: string,
  fetchImpl: typeof fetch = typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : fetch,
): Promise<number> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/stargazers/count`,
    { headers: GITHUB_HEADERS },
  )

  if (!response.ok) {
    throw new Error(`GitHub star count failed: ${response.status}`)
  }

  const data = (await response.json()) as { count?: unknown }

  if (!Number.isFinite(data.count)) {
    throw new Error('Invalid GitHub star count payload')
  }

  return Number(data.count)
}

function parseLastPage(response: Response): number | null {
  const link = response.headers.get('link') || response.headers.get('Link')
  const lastPageMatch = link?.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)

  return lastPageMatch ? Number(lastPageMatch[1]) : null
}

export async function fetchGithubStarHistory(
  repository: string,
  from: string,
  fetchImpl: typeof fetch = typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : fetch,
): Promise<TrendsPoint[]> {
  const rows: GithubStarHistoryRow[] = []
  let page = 1
  const maxPages = 100

  while (page <= maxPages) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/stargazers/history?per_page=30&page=${page}`,
      { headers: GITHUB_HEADERS },
    )

    if (!response.ok) {
      throw new Error(`GitHub star history failed: ${response.status}`)
    }

    const data = (await response.json()) as GithubStarHistoryRow[]

    if (!Array.isArray(data) || data.length === 0) break

    rows.push(...data)

    const oldestRow = data.at(-1)
    const oldestDate = oldestRow ? dateForGithubDay(oldestRow.week, 0) : null

    if (oldestDate !== null && oldestDate <= from) break

    const lastPage = parseLastPage(response)

    if (lastPage !== null && page >= lastPage) break

    if (lastPage === null && data.length < 30) break

    page += 1
  }

  const current = await fetchGithubStarCount(repository, fetchImpl)

  return buildGithubStarTotals(rows, current, { from })
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

function latestBuiltVersion(history: PackageHistoryResponse) {
  return [...history.versions]
    .filter(version => version.gzip !== null || version.size !== null)
    .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
    .at(-1)
}

async function resolveDownloads(
  packageName: string,
  range: TrendsRange,
  baseSeries?: Partial<TrendsPackageSeries>,
  fetchImpl?: typeof fetch,
): Promise<{ downloads: TrendsPoint[]; warning?: string }> {
  const downloads = baseSeries?.downloads ?? []

  const needsDownloads =
    downloads.length === 0 ||
    Boolean(
      baseSeries?.warnings?.includes('npm download history is unavailable'),
    )

  if (!needsDownloads) return { downloads }

  try {
    const points = await fetchNpmDownloads(packageName, range, fetchImpl)

    return { downloads: points }
  } catch {
    return {
      downloads: [],
      warning: 'npm download history is unavailable',
    }
  }
}

async function resolveStars(
  repository: string | null,
  from: string,
  baseSeries?: Partial<TrendsPackageSeries>,
  fetchImpl?: typeof fetch,
): Promise<{
  stars: TrendsPoint[]
  currentStars: number | null
  warning?: string
}> {
  const stars = baseSeries?.stars ?? []
  const currentStars = baseSeries?.current?.stars ?? null

  if (!repository) {
    return { stars, currentStars }
  }

  const needsStars =
    stars.length === 0 ||
    Boolean(
      baseSeries?.warnings?.includes('GitHub star history is unavailable'),
    )

  if (!needsStars) return { stars, currentStars }

  try {
    const [count, starPoints] = await Promise.all([
      fetchGithubStarCount(repository, fetchImpl).catch(() => null),
      fetchGithubStarHistory(repository, from, fetchImpl).catch(() => []),
    ])

    return { stars: starPoints, currentStars: count }
  } catch {
    return {
      stars: [],
      currentStars: null,
      warning: 'GitHub star history is unavailable',
    }
  }
}

export async function resolvePackageTrendsClient(
  packageName: string,
  range: TrendsRange,
  baseSeries?: Partial<TrendsPackageSeries>,
  fetchImpl: typeof fetch = typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : fetch,
): Promise<TrendsPackageSeries> {
  const from = startOfTrendsRangeDate(range)
  const warnings: string[] = []

  let repository = baseSeries?.repository ?? null
  let size = baseSeries?.size ?? []
  let releases = baseSeries?.releases ?? []
  let latestSize = baseSeries?.current?.size ?? null
  let latestGzip = baseSeries?.current?.gzip ?? null

  if (!size.length) {
    try {
      const history = await API.getHistory(packageName, { from, limit: 500 })

      repository = repository || history.repository
      size = sizePoints(history)
      releases = history.releases.map(release => ({
        version: release.version,
        date: release.publishedAt,
        major: release.major,
        minor: release.minor,
      }))

      const latest = latestBuiltVersion(history)

      latestSize = latest?.size ?? null
      latestGzip = latest?.gzip ?? null
    } catch {
      // keep base values
    }
  }

  const [downloadResult, starsResult] = await Promise.all([
    resolveDownloads(packageName, range, baseSeries, fetchImpl),
    resolveStars(repository, from, baseSeries, fetchImpl),
  ])

  if (downloadResult.warning) warnings.push(downloadResult.warning)

  if (starsResult.warning) warnings.push(starsResult.warning)

  const downloads = downloadResult.downloads

  return {
    name: packageName,
    repository,
    downloads,
    stars: starsResult.stars,
    size,
    releases,
    current: {
      weeklyDownloads:
        downloads.length > 0
          ? downloads.slice(-7).reduce((total, p) => total + p.value, 0)
          : null,
      stars: starsResult.currentStars,
      size: latestSize,
      gzip: latestGzip,
    },
    warnings,
  }
}

export async function fetchTrends(
  packages: string[],
  range: TrendsRange,
  fetchImpl: typeof fetch = typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : fetch,
): Promise<TrendsResponse> {
  const now = Date.now()
  const results: TrendsPackageSeries[] = []
  const uncached: string[] = []

  for (const pkg of packages) {
    const cached = getCachedTrendsSeries(pkg, range, now)

    if (cached) {
      results.push(cached)
    } else {
      uncached.push(pkg)
    }
  }

  if (uncached.length === 0) {
    return {
      packages: packages.flatMap(pkg => {
        const found = results.find(r => r.name === pkg)

        return found ? [found] : []
      }),
      range,
      generatedAt: new Date().toISOString(),
    }
  }

  let serverData: TrendsResponse | null = null

  try {
    const params = new URLSearchParams({
      packages: uncached.join(','),
      range,
    })

    serverData = await API.get<TrendsResponse>(`/api/trends?${params}`)
  } catch {
    serverData = null
  }

  const resolved = await Promise.all(
    uncached.map(async pkg => {
      const serverSeries = serverData?.packages.find(p => p.name === pkg)

      if (
        serverSeries &&
        (!serverSeries.warnings || serverSeries.warnings.length === 0)
      ) {
        return serverSeries
      }

      return resolvePackageTrendsClient(pkg, range, serverSeries, fetchImpl)
    }),
  )

  for (const series of resolved) {
    setCachedTrendsSeries(series.name, range, series, now)
    results.push(series)
  }

  return {
    packages: packages.flatMap(pkg => {
      const found = results.find(r => r.name === pkg)

      return found ? [found] : []
    }),
    range,
    generatedAt: new Date().toISOString(),
  }
}
