import axios from 'axios'

import config from '../config'
import { isGithubRepository } from '../packages/repository'

export interface GithubRepositoryHistoryRow {
  time: string
  stargazers_count: number
  open_issues_count: number
}

interface ClickHouseResponse {
  data?: GithubRepositoryHistoryRow[]
}

const client = axios.create({
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.CLICKHOUSE,
  headers: { 'Content-Type': 'text/plain' },
})

export async function fetchGithubRepositoryHistory(
  repository: string
): Promise<GithubRepositoryHistoryRow[]> {
  if (!isGithubRepository(repository)) {
    throw new TypeError(`Invalid GitHub repository: ${repository}`)
  }

  const sql = `
SELECT
  time,
  stargazers_count,
  open_issues_count
FROM github_repos_history
WHERE full_name = '${repository}'
ORDER BY time
`.trim()

  const { data } = await client.post<ClickHouseResponse>(
    config.EXTERNAL_SERVICES.CLICKHOUSE_TRENDS_URL,
    sql
  )
  return data.data || []
}
