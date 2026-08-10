import axios from 'axios'

const ACCEPT_JSON = { Accept: 'application/json' }

export const githubClient = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 10_000,
  headers: ACCEPT_JSON,
})

export const npmDownloadsClient = axios.create({
  baseURL: 'https://api.npmjs.org',
  timeout: 15_000,
})

export const ossInsightClient = axios.create({
  baseURL: 'https://api.ossinsight.io',
  timeout: 20_000,
  headers: ACCEPT_JSON,
})

export const clickHouseClient = axios.create({
  timeout: 20_000,
  headers: { 'Content-Type': 'text/plain' },
})
