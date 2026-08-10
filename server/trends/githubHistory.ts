import axios from 'axios'

import { getCached, setCached } from './memoryCache'
import { getTrendsRangeStart } from './range'
import type { TrendsPoint, TrendsRange } from './types'

type ClickHouseJson = {
  data?: Array<{
    time: string
    stargazers_count: number
    open_issues_count: number
  }>
}

type GithubRepoMetadata = {
  full_name?: string
  stargazers_count?: number
  open_issues_count?: number
}

type OssInsightJson = {
  data?: {
    rows?: Array<{
      date: string
      stargazers: string | number
    }>
  }
}

function isSafeRepoName(repo: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
}

function toDate(value: string) {
  return value.slice(0, 10)
}

// Known org/repo renames for ClickHouse historical dataset
const REPO_FALLBACKS: Record<string, string[]> = {
  'react/react': ['facebook/react'],
  'facebook/react': ['react/react'],
  'vuejs/core': ['vuejs/vue'],
  'vuejs/vue': ['vuejs/core'],
  'angular/core': ['angular/angular'],
  'vercel/next.js': ['zeit/next.js'],
  'reduxjs/redux': ['reactjs/redux'],
}

async function queryClickHouse(repoName: string): Promise<{
  stars: TrendsPoint[]
  issues: TrendsPoint[]
}> {
  const endpoint =
    process.env.CLICKHOUSE_TRENDS_URL ||
    'https://play.clickhouse.com/?user=play&default_format=JSON'

  const sql = `
SELECT
  time,
  stargazers_count,
  open_issues_count
FROM github_repos_history
WHERE full_name = '${repoName}'
ORDER BY time
`.trim()

  const { data } = await axios.post<ClickHouseJson>(endpoint, sql, {
    timeout: 20_000,
    headers: { 'Content-Type': 'text/plain' },
  })

  const rows = data.data || []
  const stars: TrendsPoint[] = []
  const issues: TrendsPoint[] = []

  for (const row of rows) {
    const date = toDate(row.time)
    stars.push({ date, value: Number(row.stargazers_count) || 0 })
    issues.push({ date, value: Number(row.open_issues_count) || 0 })
  }

  return { stars, issues }
}

async function fetchClickHouseHistory(repo: string): Promise<{
  stars: TrendsPoint[]
  issues: TrendsPoint[]
}> {
  if (!isSafeRepoName(repo)) {
    return { stars: [], issues: [] }
  }

  const cacheKey = `ch-history:${repo}`
  const cached = getCached<{ stars: TrendsPoint[]; issues: TrendsPoint[] }>(
    cacheKey
  )
  if (cached) {
    return cached
  }

  try {
    let result = await queryClickHouse(repo)

    // If primary repo has no historical rows in ClickHouse, check fallback aliases
    if (result.stars.length === 0) {
      const fallbacks = REPO_FALLBACKS[repo] || []
      for (const fb of fallbacks) {
        const altResult = await queryClickHouse(fb)
        if (altResult.stars.length > 0) {
          result = altResult
          break
        }
      }
    }

    setCached(cacheKey, result, 12 * 60 * 60 * 1000)
    return result
  } catch {
    return { stars: [], issues: [] }
  }
}

async function fetchOssInsightStars(
  repo: string,
  range: TrendsRange
): Promise<TrendsPoint[]> {
  if (!isSafeRepoName(repo)) return []

  const from = getTrendsRangeStart(range)
  const cacheKey = `ossinsight-stars:${repo}:${from}`
  const cached = getCached<TrendsPoint[]>(cacheKey)
  if (cached) return cached

  try {
    const { data } = await axios.get<OssInsightJson>(
      `https://api.ossinsight.io/v1/repos/${repo}/stargazers/history/`,
      {
        params: {
          per: 'day',
          from,
          to: new Date().toISOString().slice(0, 10),
        },
        timeout: 20_000,
        headers: { Accept: 'application/json' },
      }
    )
    const points = (data.data?.rows || [])
      .map(row => ({
        date: row.date.slice(0, 10),
        value: Number(row.stargazers),
      }))
      .filter(point => Number.isFinite(point.value))

    if (points.length === 0) return []
    setCached(cacheKey, points, 12 * 60 * 60 * 1000)
    return points
  } catch {
    return []
  }
}

async function fetchLiveGithubStats(repo: string): Promise<{
  stars: number | null
  openIssues: number | null
  fullName: string | null
}> {
  if (!isSafeRepoName(repo)) {
    return { stars: null, openIssues: null, fullName: null }
  }

  const cacheKey = `gh-live:${repo}`
  const cached = getCached<{
    stars: number | null
    openIssues: number | null
    fullName: string | null
  }>(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    const { data } = await axios.get<GithubRepoMetadata>(
      `https://api.github.com/repos/${repo}`,
      {
        timeout: 10_000,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'bundlephobia-trends',
          ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
        },
        maxRedirects: 5,
      }
    )

    const result = {
      stars:
        typeof data.stargazers_count === 'number'
          ? data.stargazers_count
          : null,
      openIssues:
        typeof data.open_issues_count === 'number'
          ? data.open_issues_count
          : null,
      fullName: data.full_name || repo,
    }
    setCached(cacheKey, result, 60 * 60 * 1000)
    return result
  } catch {
    const result = { stars: null, openIssues: null, fullName: null }
    setCached(cacheKey, result, 15 * 60 * 1000)
    return result
  }
}

function pinLivePoint(
  series: TrendsPoint[],
  liveValue: number | null
): TrendsPoint[] {
  if (liveValue == null) {
    return series
  }

  const today = new Date().toISOString().slice(0, 10)
  if (series.length === 0) {
    return [{ date: today, value: liveValue, partial: true }]
  }

  const last = series[series.length - 1]
  if (last.date === today) {
    return [
      ...series.slice(0, -1),
      { date: today, value: liveValue, partial: true },
    ]
  }

  return [...series, { date: today, value: liveValue, partial: true }]
}

export async function fetchGithubTrendSeries(
  repo: string,
  range: TrendsRange = 'last-year'
): Promise<{
  stars: TrendsPoint[]
  issues: TrendsPoint[]
  currentStars: number | null
  currentIssues: number | null
  warning?: string
}> {
  const [clickHouseHistory, ossInsightStars, live] = await Promise.all([
    fetchClickHouseHistory(repo),
    fetchOssInsightStars(repo, range),
    fetchLiveGithubStats(repo),
  ])

  const historicalStars =
    ossInsightStars.length > 0 ? ossInsightStars : clickHouseHistory.stars
  const stars = pinLivePoint(historicalStars, live.stars)
  const issues = pinLivePoint(clickHouseHistory.issues, live.openIssues)

  const today = new Date()
  const currentMonth = `${today.getUTCFullYear()}-${String(
    today.getUTCMonth() + 1
  ).padStart(2, '0')}-01`
  const latestHistoricalDate = [
    historicalStars.at(-1)?.date,
    clickHouseHistory.issues.at(-1)?.date,
  ]
    .filter((date): date is string => Boolean(date))
    .sort()[0]
  const warning =
    historicalStars.length === 0 && live.stars == null
      ? 'No GitHub history or current snapshot is available for this repository.'
      : historicalStars.length === 0
      ? 'Only the current GitHub snapshot is available for this repository.'
      : latestHistoricalDate && latestHistoricalDate < currentMonth
      ? `GitHub history last updated on ${latestHistoricalDate}; recent months may be unavailable.`
      : ossInsightStars.length > 0
      ? undefined
      : 'OSSInsight history unavailable; using the secondary ClickHouse history.'

  return {
    stars,
    issues,
    currentStars: live.stars,
    currentIssues: live.openIssues,
    warning,
  }
}
