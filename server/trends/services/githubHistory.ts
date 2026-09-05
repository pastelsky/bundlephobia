import {
  fetchGithubRepository,
  fetchGithubStarHistoryPage,
  type GithubStarHistoryRow,
} from '../../clients/github'
import { isGithubRepository } from '../../packages/repository'
import { getOrLoadTrendsData } from '../cache'
import { trendsConfig } from '../config'
import { getTrendsRangeStart } from '../range'
import type { TrendsPoint, TrendsRange } from '../types'

const MAX_GITHUB_HISTORY_PAGES = 100

type GithubStarHistory = {
  points: TrendsPoint[]
  historyThrough: string | null
  complete: boolean
}

export type GithubTrendSource = 'github-star-history' | 'unavailable'

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateForGithubDay(week: number, day: number) {
  const date = new Date(week * 1000)
  if (!Number.isFinite(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() + day)
  return isoDate(date)
}

function isValidHistoryRow(row: GithubStarHistoryRow) {
  if (!row || typeof row !== 'object') return false

  return (
    Number.isSafeInteger(row.week) &&
    row.week > 0 &&
    Number.isSafeInteger(row.total) &&
    row.total >= 0 &&
    dateForGithubDay(row.week, 0) !== null &&
    Array.isArray(row.days) &&
    row.days.length === 7 &&
    row.days.every(day => Number.isSafeInteger(day) && day >= 0) &&
    row.days.reduce((sum, day) => sum + day, 0) === row.total
  )
}

function mapGithubStarHistory(rows: GithubStarHistoryRow[]): TrendsPoint[] {
  const today = isoDate(new Date())
  const points = rows.flatMap(row => {
    if (!isValidHistoryRow(row)) return []

    return row.days.flatMap((value, day) => {
      const date = dateForGithubDay(row.week, day)
      if (!date || date > today) return []
      return [{ date, value, partial: date === today }]
    })
  })

  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

async function fetchGithubStarHistory(
  repository: string,
  range: TrendsRange,
): Promise<GithubStarHistory> {
  const from = getTrendsRangeStart(range)
  const cacheKey = `github-stars:${repository}:${from}`

  return getOrLoadTrendsData(
    'github-history',
    cacheKey,
    trendsConfig.cacheTtlMs.githubHistory,
    async () => {
      const rows: GithubStarHistoryRow[] = []
      let page = 1
      let lastPage: number | null = null
      let complete = true

      while (page <= MAX_GITHUB_HISTORY_PAGES) {
        try {
          const result = await fetchGithubStarHistoryPage(repository, page)
          rows.push(...result.rows)
          lastPage = result.lastPage

          const oldestRow = result.rows.at(-1)
          const oldestDate = oldestRow
            ? dateForGithubDay(oldestRow.week, 0)
            : null
          if (oldestDate && oldestDate <= from) {
            break
          }
          if (result.rows.length === 0) break
          if (lastPage !== null && page >= lastPage) break
          if (lastPage === null && result.rows.length < 30) break

          page += 1
        } catch {
          complete = false
          break
        }
      }

      const points = mapGithubStarHistory(rows).filter(
        point => point.date >= from,
      )
      return {
        points,
        historyThrough: points.at(-1)?.date || null,
        complete,
      }
    },
  )
}

async function fetchLiveGithubStats(repository: string): Promise<{
  stars: number | null
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
        }
      } catch {
        return { stars: null }
      }
    },
  )
}

/** Returns exact historical star actions and the current star snapshot. */
export async function fetchGithubTrendSeries(
  repository: string,
  range: TrendsRange = 'last-year',
): Promise<{
  stars: TrendsPoint[]
  currentStars: number | null
  sources: {
    stars: GithubTrendSource
    historyThrough: string | null
    historyComplete: boolean
  }
}> {
  if (!isGithubRepository(repository)) {
    return {
      stars: [],
      currentStars: null,
      sources: {
        stars: 'unavailable',
        historyThrough: null,
        historyComplete: false,
      },
    }
  }

  const [history, live] = await Promise.all([
    fetchGithubStarHistory(repository, range),
    fetchLiveGithubStats(repository),
  ])

  return {
    stars: history.points,
    currentStars: live.stars,
    sources: {
      stars: history.points.length > 0 ? 'github-star-history' : 'unavailable',
      historyThrough: history.historyThrough,
      historyComplete: history.complete,
    },
  }
}
