import {
  fetchGithubRepositoryHistory,
  type GithubRepositoryHistoryRow,
} from '../../clients/clickHouse'
import { fetchGithubRepository } from '../../clients/github'
import { fetchOssInsightStarHistory } from '../../clients/ossInsight'
import { isGithubRepository } from '../../packages/repository'
import { getOrLoadTrendsData } from '../cache'
import { trendsConfig } from '../config'
import { getTrendsRangeStart } from '../range'
import { githubHistoryFallbacks } from '../repositories'
import type { TrendsPoint, TrendsRange } from '../types'

type GithubHistory = {
  stars: TrendsPoint[]
  issues: TrendsPoint[]
}

export type GithubTrendSource =
  | 'clickhouse'
  | 'github-snapshot'
  | 'ossinsight'
  | 'unavailable'

function mapHistoryRows(rows: GithubRepositoryHistoryRow[]): GithubHistory {
  const stars: TrendsPoint[] = []
  const issues: TrendsPoint[] = []

  for (const row of rows) {
    const date = row.time.slice(0, 10)
    stars.push({ date, value: Number(row.stargazers_count) || 0 })
    issues.push({ date, value: Number(row.open_issues_count) || 0 })
  }

  return { stars, issues }
}

async function fetchClickHouseHistory(
  repository: string
): Promise<GithubHistory> {
  const cacheKey = `clickhouse:${repository}`
  return getOrLoadTrendsData(
    'github-history',
    cacheKey,
    trendsConfig.cacheTtlMs.githubHistory,
    async () => {
      for (const candidate of [
        repository,
        ...githubHistoryFallbacks(repository),
      ]) {
        try {
          const result = mapHistoryRows(
            await fetchGithubRepositoryHistory(candidate)
          )
          if (result.stars.length > 0) return result
        } catch {
          // Try the next known repository name before treating history as absent.
        }
      }
      return { stars: [], issues: [] }
    }
  )
}

async function fetchOssInsightStars(
  repository: string,
  range: TrendsRange
): Promise<TrendsPoint[]> {
  const from = getTrendsRangeStart(range)
  const cacheKey = `ossinsight:${repository}:${from}`
  return getOrLoadTrendsData(
    'github-history',
    cacheKey,
    trendsConfig.cacheTtlMs.githubHistory,
    async () => {
      try {
        const rows = await fetchOssInsightStarHistory(
          repository,
          from,
          new Date().toISOString().slice(0, 10)
        )
        return rows
          .map(row => ({
            date: row.date.slice(0, 10),
            value: Number(row.stargazers),
          }))
          .filter(point => Number.isFinite(point.value))
      } catch {
        return []
      }
    }
  )
}

async function fetchLiveGithubStats(repository: string): Promise<{
  stars: number | null
  openIssues: number | null
}> {
  const cacheKey = `github-snapshot:${repository}`
  return getOrLoadTrendsData(
    'github-history',
    cacheKey,
    trendsConfig.cacheTtlMs.githubSnapshot,
    async () => {
      try {
        const metadata = await fetchGithubRepository(repository)
        return {
          stars:
            typeof metadata.stargazers_count === 'number'
              ? metadata.stargazers_count
              : null,
          openIssues:
            typeof metadata.open_issues_count === 'number'
              ? metadata.open_issues_count
              : null,
        }
      } catch {
        return { stars: null, openIssues: null }
      }
    }
  )
}

function pinLivePoint(
  series: TrendsPoint[],
  liveValue: number | null
): TrendsPoint[] {
  if (liveValue == null) return series

  const today = new Date().toISOString().slice(0, 10)
  const livePoint = { date: today, value: liveValue, partial: true }
  return series.at(-1)?.date === today
    ? [...series.slice(0, -1), livePoint]
    : [...series, livePoint]
}

/**
 * Combines substantiated history with a separately marked current snapshot.
 * Source metadata stays structured so presentation layers can explain gaps.
 */
export async function fetchGithubTrendSeries(
  repository: string,
  range: TrendsRange = 'last-year'
): Promise<{
  stars: TrendsPoint[]
  issues: TrendsPoint[]
  currentStars: number | null
  currentIssues: number | null
  sources: {
    stars: GithubTrendSource
    issues: GithubTrendSource
    historyThrough: string | null
  }
}> {
  if (!isGithubRepository(repository)) {
    return {
      stars: [],
      issues: [],
      currentStars: null,
      currentIssues: null,
      sources: {
        stars: 'unavailable',
        issues: 'unavailable',
        historyThrough: null,
      },
    }
  }

  const [clickHouseHistory, ossInsightStars, live] = await Promise.all([
    fetchClickHouseHistory(repository),
    fetchOssInsightStars(repository, range),
    fetchLiveGithubStats(repository),
  ])

  const historicalStars =
    ossInsightStars.length > 0 ? ossInsightStars : clickHouseHistory.stars
  const historicalDates = [
    historicalStars.at(-1)?.date,
    clickHouseHistory.issues.at(-1)?.date,
  ].filter((date): date is string => Boolean(date))

  return {
    stars: pinLivePoint(historicalStars, live.stars),
    issues: pinLivePoint(clickHouseHistory.issues, live.openIssues),
    currentStars: live.stars,
    currentIssues: live.openIssues,
    sources: {
      stars:
        ossInsightStars.length > 0
          ? 'ossinsight'
          : clickHouseHistory.stars.length > 0
          ? 'clickhouse'
          : live.stars != null
          ? 'github-snapshot'
          : 'unavailable',
      issues:
        clickHouseHistory.issues.length > 0
          ? 'clickhouse'
          : live.openIssues != null
          ? 'github-snapshot'
          : 'unavailable',
      historyThrough: historicalDates.sort()[0] || null,
    },
  }
}
