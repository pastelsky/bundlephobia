/* eslint-disable max-params, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion */

import type {
  TrendsPoint,
  TrendsRange,
} from '@bundlephobia/service-contracts/trends'
import {
  buildGithubStarTotals,
  dateForGithubDay,
  startOfTrendsRangeDate,
  type GithubStarHistoryRow,
} from '../utils/trends'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function getDefaultFetch(): FetchLike {
  if (typeof window !== 'undefined') {
    return window.fetch.bind(window)
  }

  return fetch
}

export type GithubStarData = {
  stars: TrendsPoint[]
  current: number | null
}

const starsCache = new Map<string, GithubStarData>()

export function clearGithubStarsCache(): void {
  starsCache.clear()
}

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
}

export async function fetchGithubStarCount(
  repository: string,
  fetchImpl: FetchLike = getDefaultFetch(),
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

function shouldStopHistory(
  rows: GithubStarHistoryRow[],
  from: string,
  page: number,
  lastPage: number | null,
): boolean {
  if (rows.length === 0) return true

  const oldestRow = rows.at(-1)
  const oldestDate = oldestRow ? dateForGithubDay(oldestRow.week, 0) : null

  return Boolean(
    (oldestDate !== null && oldestDate <= from) ||
    (lastPage !== null && page >= lastPage) ||
    (lastPage === null && rows.length < 30),
  )
}

export async function fetchGithubStarHistoryRows(
  repository: string,
  from: string,
  fetchImpl: FetchLike = getDefaultFetch(),
): Promise<GithubStarHistoryRow[]> {
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

    const lastPage = parseLastPage(response)

    if (shouldStopHistory(data, from, page, lastPage)) break

    page += 1
  }

  return rows
}

export async function getPackageGithubStars(
  repository: string,
  range: TrendsRange,
  fetchImpl: FetchLike = getDefaultFetch(),
): Promise<GithubStarData> {
  const cacheKey = `${repository}:${range}`
  const cached = starsCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const from = startOfTrendsRangeDate(range)

  const [current, rows] = await Promise.all([
    fetchGithubStarCount(repository, fetchImpl),
    fetchGithubStarHistoryRows(repository, from, fetchImpl),
  ])

  const stars = buildGithubStarTotals(rows, current, { from })

  const result: GithubStarData = {
    stars,
    current,
  }

  starsCache.set(cacheKey, result)

  return result
}
