import axios from 'axios'

import config from '../config'
import { isGithubRepository } from '../packages/repository'

export interface OssInsightStarHistoryRow {
  date: string
  stargazers: string | number
}

interface OssInsightResponse {
  data?: { rows?: OssInsightStarHistoryRow[] }
}

const client = axios.create({
  baseURL: 'https://api.ossinsight.io',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.OSS_INSIGHT,
  headers: { Accept: 'application/json' },
})

export async function fetchOssInsightStarHistory(
  repository: string,
  from: string,
  to: string
): Promise<OssInsightStarHistoryRow[]> {
  if (!isGithubRepository(repository)) {
    throw new TypeError(`Invalid GitHub repository: ${repository}`)
  }

  const { data } = await client.get<OssInsightResponse>(
    `/v1/repos/${repository}/stargazers/history/`,
    { params: { per: 'day', from, to } }
  )
  return data.data?.rows || []
}
