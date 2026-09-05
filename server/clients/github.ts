import axios from 'axios'

import config from '../config'
import { isGithubRepository } from '../packages/repository'

export interface GithubRepositoryMetadata {
  stargazers_count?: number
}

export interface GithubStarHistoryRow {
  week: number
  total: number
  days: number[]
}

export interface GithubStarHistoryPage {
  rows: GithubStarHistoryRow[]
  lastPage: number | null
}

const client = axios.create({
  baseURL: 'https://api.github.com',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.GITHUB,
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
  },
})

function githubRequestHeaders() {
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  return {
    'User-Agent': 'bundlephobia-trends',
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  }
}

export async function fetchGithubRepository(
  repository: string,
): Promise<GithubRepositoryMetadata> {
  if (!isGithubRepository(repository)) {
    throw new TypeError(`Invalid GitHub repository: ${repository}`)
  }

  const { data } = await client.get<GithubRepositoryMetadata>(
    `/repos/${repository}`,
    {
      headers: githubRequestHeaders(),
      maxRedirects: 5,
    },
  )
  return data
}

/**
 * Returns GitHub's privacy-safe weekly star history. The `days` values are
 * star actions for Sunday through Saturday; they are not cumulative totals.
 */
export async function fetchGithubStarHistoryPage(
  repository: string,
  page: number,
): Promise<GithubStarHistoryPage> {
  if (!isGithubRepository(repository)) {
    throw new TypeError(`Invalid GitHub repository: ${repository}`)
  }
  if (!Number.isInteger(page) || page < 1 || page > 100) {
    throw new RangeError(`Invalid GitHub star history page: ${page}`)
  }

  const response = await client.get<GithubStarHistoryRow[]>(
    `/repos/${repository}/stargazers/history`,
    {
      params: { per_page: 30, page },
      headers: githubRequestHeaders(),
      maxRedirects: 5,
    },
  )

  const link = response.headers.link || response.headers.Link
  const lastPageMatch = link
    ?.split(',')
    .find((part: string) => part.includes('rel="last"'))
    ?.match(/[?&]page=(\d+)/)

  return {
    rows: Array.isArray(response.data) ? response.data : [],
    lastPage: lastPageMatch ? Number(lastPageMatch[1]) : null,
  }
}
