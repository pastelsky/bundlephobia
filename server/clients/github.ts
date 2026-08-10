import axios from 'axios'

import config from '../config'
import { isGithubRepository } from '../packages/repository'

export interface GithubRepositoryMetadata {
  full_name?: string
  stargazers_count?: number
  open_issues_count?: number
}

const client = axios.create({
  baseURL: 'https://api.github.com',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.GITHUB,
  headers: { Accept: 'application/vnd.github+json' },
})

export async function fetchGithubRepository(
  repository: string
): Promise<GithubRepositoryMetadata> {
  if (!isGithubRepository(repository)) {
    throw new TypeError(`Invalid GitHub repository: ${repository}`)
  }

  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const { data } = await client.get<GithubRepositoryMetadata>(
    `/repos/${repository}`,
    {
      headers: {
        'User-Agent': 'bundlephobia-trends',
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      },
      maxRedirects: 5,
    }
  )
  return data
}
