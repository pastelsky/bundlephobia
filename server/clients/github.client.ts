import axios from 'axios'
import { z } from 'zod'

import config from '../config'

const githubStarCountSchema = z.object({
  count: z.number().int().nonnegative(),
})

const githubStarHistoryRowSchema = z.object({
  week: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  days: z.array(z.number().int().nonnegative()).length(7),
})

const githubStarHistorySchema = z.array(githubStarHistoryRowSchema)

export type GithubStarHistoryRow = z.infer<typeof githubStarHistoryRowSchema>

export type GithubStarHistoryPage = {
  rows: GithubStarHistoryRow[]
  lastPage: number | null
}

const githubRepositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

type GithubRequestHeaders = {
  'User-Agent': string
  Authorization?: string
}

const client = axios.create({
  baseURL: 'https://api.github.com',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.GITHUB,
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
  },
})

function requestHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

  const headers: GithubRequestHeaders = {
    'User-Agent': 'bundlephobia-trends',
  }

  if (token) headers.Authorization = `Bearer ${token}`

  return headers
}

function assertRepository(repository: string): void {
  if (!githubRepositoryPattern.test(repository)) {
    throw new TypeError(`Invalid GitHub repository: ${repository}`)
  }
}

export async function fetchGithubStarCount(
  repository: string,
): Promise<number> {
  assertRepository(repository)

  const { data } = await client.get<unknown>(
    `/repos/${repository}/stargazers/count`,
    { headers: requestHeaders(), maxRedirects: 5 },
  )

  return githubStarCountSchema.parse(data).count
}

export async function fetchGithubStarHistoryPage(
  repository: string,
  page: number,
): Promise<GithubStarHistoryPage> {
  assertRepository(repository)

  if (!Number.isInteger(page) || page < 1 || page > 100) {
    throw new RangeError(`Invalid GitHub star history page: ${page}`)
  }

  const response = await client.get<unknown>(
    `/repos/${repository}/stargazers/history`,
    {
      params: { per_page: 30, page },
      headers: requestHeaders(),
      maxRedirects: 5,
    },
  )

  const link = response.headers.link || response.headers.Link

  const lastPageMatch = link ? findLastPage(link) : null

  return {
    rows: githubStarHistorySchema.parse(response.data),
    lastPage: lastPageMatch ? Number(lastPageMatch[1]) : null,
  }
}

function findLastPage(link: string): RegExpMatchArray | null {
  return (
    link
      .split(',')
      .find((part: string) => part.includes('rel="last"'))
      ?.match(/[?&]page=(\d+)/) ?? null
  )
}
