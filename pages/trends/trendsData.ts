import fetch from 'unfetch'

import API, {
  type TrendsGroupBy,
  type TrendsPackageSeries,
  type TrendsPoint,
  type TrendsRange,
  type TrendsResponse,
} from '../../client/api'
import type { PackageHistoryResponse } from '../../types/package-history'
import {
  filterPointsByRange,
  getTrendsRangeStart,
  rollupPoints,
} from '../../server/trends/range'

type NpmDownloadsResponse = {
  downloads?: Array<{ day: string; downloads: number }>
}

type GithubHistoryRow = {
  week: number
  total: number
  days: number[]
}

type GithubRepositoryResponse = {
  stargazers_count?: number
}

const GITHUB_API = 'https://api.github.com'
const NPM_DOWNLOADS_API = 'https://api.npmjs.org'
const GITHUB_HISTORY_PAGE_SIZE = 100
const MAX_GITHUB_HISTORY_PAGES = 20
const NPM_MAX_RANGE_MONTHS = 18

async function getJson<T>(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
  })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

function encodeNpmPackage(packageName: string) {
  return packageName
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getNpmBuckets(range: TrendsRange) {
  const end = new Date()
  const start = new Date(end)
  if (range === 'last-2-months') start.setUTCMonth(start.getUTCMonth() - 2)
  if (range === 'last-year') start.setUTCFullYear(start.getUTCFullYear() - 1)
  if (range === 'last-3-years') start.setUTCFullYear(start.getUTCFullYear() - 3)

  if (range !== 'last-3-years') {
    return [{ start: isoDate(start), end: isoDate(end) }]
  }

  const buckets: Array<{ start: string; end: string }> = []
  let cursor = new Date(start)
  while (cursor < end) {
    const bucketEnd = new Date(cursor)
    bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + NPM_MAX_RANGE_MONTHS)
    bucketEnd.setUTCDate(bucketEnd.getUTCDate() - 1)
    const actualEnd = bucketEnd < end ? bucketEnd : end
    buckets.push({ start: isoDate(cursor), end: isoDate(actualEnd) })
    cursor = new Date(actualEnd)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return buckets
}

async function fetchDownloads(
  packageName: string,
  range: TrendsRange,
): Promise<{ points: TrendsPoint[]; weeklyDownloads: number | null }> {
  const buckets = getNpmBuckets(range)
  const responses = await Promise.all(
    buckets.map(bucket =>
      getJson<NpmDownloadsResponse>(
        `${NPM_DOWNLOADS_API}/downloads/range/${bucket.start}:${bucket.end}/${encodeNpmPackage(packageName)}`,
      ),
    ),
  )
  const today = isoDate(new Date())
  const pointsByDate = new Map<string, TrendsPoint>()
  responses.forEach(response => {
    response.downloads?.forEach(point => {
      pointsByDate.set(point.day, {
        date: point.day,
        value: point.downloads,
        partial: point.day === today,
      })
    })
  })
  const points = Array.from(pointsByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  const latestWeek = points.slice(-7)
  return {
    points,
    weeklyDownloads: latestWeek.length
      ? latestWeek.reduce((sum, point) => sum + point.value, 0)
      : null,
  }
}

function githubDayPoints(rows: GithubHistoryRow[]): TrendsPoint[] {
  return rows.flatMap(row => {
    if (
      !Number.isSafeInteger(row.week) ||
      row.week < 0 ||
      !Number.isInteger(row.total) ||
      row.total < 0 ||
      !Array.isArray(row.days) ||
      row.days.length !== 7 ||
      row.days.some(day => !Number.isInteger(day) || day < 0) ||
      row.days.reduce((sum, day) => sum + day, 0) !== row.total
    ) {
      return []
    }

    const start = new Date(row.week * 1000)
    return row.days.map((value, offset) => {
      const date = new Date(start)
      date.setUTCDate(date.getUTCDate() + offset)
      return { date: isoDate(date), value }
    })
  })
}

async function fetchGithub(
  repository: string,
  range: TrendsRange,
): Promise<{ points: TrendsPoint[]; currentStars: number | null }> {
  const headers = { 'X-GitHub-Api-Version': '2026-03-10' }
  const metadata = await getJson<GithubRepositoryResponse>(
    `${GITHUB_API}/repos/${repository}`,
    headers,
  )
  const rows: GithubHistoryRow[] = []
  const rangeStart = getTrendsRangeStart(range)

  for (let page = 1; page <= MAX_GITHUB_HISTORY_PAGES; page += 1) {
    const pageRows = await getJson<GithubHistoryRow[]>(
      `${GITHUB_API}/repos/${repository}/stargazers/history?page=${page}&per_page=${GITHUB_HISTORY_PAGE_SIZE}`,
      headers,
    )
    if (pageRows.length === 0) break
    rows.push(...pageRows)

    const oldest = pageRows.at(-1)
    if (
      !oldest ||
      isoDate(new Date(oldest.week * 1000)) <= rangeStart ||
      pageRows.length < GITHUB_HISTORY_PAGE_SIZE
    ) {
      break
    }
  }

  const today = isoDate(new Date())
  const points = githubDayPoints(rows)
    .filter(point => point.date >= rangeStart)
    .sort((a, b) => a.date.localeCompare(b.date))
  const liveValue =
    typeof metadata.stargazers_count === 'number'
      ? metadata.stargazers_count
      : null
  const last = points.at(-1)
  if (liveValue !== null && last?.date === today) {
    last.value = liveValue
    last.partial = true
  } else if (liveValue !== null) {
    points.push({ date: today, value: liveValue, partial: true })
  }

  return { points, currentStars: liveValue }
}

function sizePoints(history: PackageHistoryResponse): TrendsPoint[] {
  return history.versions
    .filter(
      version =>
        typeof version.gzip === 'number' && version.publishedAt !== null,
    )
    .map(version => ({
      date: version.publishedAt as string,
      value: version.gzip as number,
      version: version.version,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchPackageSeries(
  packageName: string,
  range: TrendsRange,
  groupBy: TrendsGroupBy,
): Promise<TrendsPackageSeries> {
  const warnings: string[] = []
  const [historyResult, downloadsResult] = await Promise.allSettled([
    API.getHistory(packageName, {
      from: getTrendsRangeStart(range),
      limit: 500,
    }),
    fetchDownloads(packageName, range),
  ])

  const history =
    historyResult.status === 'fulfilled'
      ? historyResult.value
      : ({
          name: packageName,
          repository: null,
          versions: [],
          releases: [],
          range: { from: getTrendsRangeStart(range), to: null },
        } satisfies PackageHistoryResponse)
  if (historyResult.status === 'rejected') {
    warnings.push('Bundle-size and release history unavailable.')
  }

  const downloads =
    downloadsResult.status === 'fulfilled'
      ? downloadsResult.value
      : { points: [], weeklyDownloads: null }
  if (downloadsResult.status === 'rejected') {
    warnings.push('Download history unavailable.')
  }

  let github = { points: [], currentStars: null as number | null }
  if (history.repository) {
    try {
      github = await fetchGithub(history.repository, range)
    } catch {
      warnings.push('GitHub history unavailable.')
    }
  } else {
    warnings.push('No GitHub repository found for this package.')
  }

  const sizes = sizePoints(history)
  if (sizes.length === 0) warnings.push('No cached bundle-size history yet.')

  const stars = rollupPoints(
    filterPointsByRange(github.points, range),
    groupBy,
    'last',
    true,
  )
  const size = rollupPoints(filterPointsByRange(sizes, range), groupBy, 'last')
  const rolledDownloads = rollupPoints(downloads.points, groupBy, 'sum')
  const latestSize = sizes.at(-1)
  const latestVersion = latestSize?.version
    ? history.versions.find(version => version.version === latestSize.version)
    : undefined

  return {
    name: packageName,
    repository: history.repository,
    downloads: rolledDownloads,
    stars,
    size,
    releases: history.releases.map(release => ({
      version: release.version,
      date: release.publishedAt,
      major: release.major,
      minor: release.minor,
    })),
    current: {
      weeklyDownloads: downloads.weeklyDownloads,
      stars: github.currentStars,
      gzip: latestSize?.value ?? null,
      size: latestVersion?.size ?? null,
    },
    warnings: Array.from(new Set(warnings)),
  }
}

export async function fetchClientTrends(
  packages: string[],
  range: TrendsRange,
  groupBy: TrendsGroupBy,
): Promise<TrendsResponse> {
  const results = await Promise.all(
    packages.map(packageName =>
      fetchPackageSeries(packageName, range, groupBy),
    ),
  )
  return {
    packages: results,
    range,
    groupBy,
    generatedAt: new Date().toISOString(),
  }
}
