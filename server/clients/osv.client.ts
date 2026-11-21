import axios from 'axios'

import config from '../config'

const MAX_OSV_PAGES = 5

export type OsvRangeEvent = {
  introduced?: string
  fixed?: string
  last_affected?: string
  limit?: string
}

export type OsvRange = {
  type?: string
  events?: OsvRangeEvent[]
}

export type OsvAffected = {
  package?: {
    name?: string
    ecosystem?: string
  }
  ranges?: OsvRange[]
  versions?: string[]
}

export type OsvVulnerability = {
  id: string
  aliases?: string[]
  summary?: string
  published?: string
  modified?: string
  withdrawn?: string
  database_specific?: {
    severity?: string
  }
  affected?: OsvAffected[]
}

type OsvQueryRequest = {
  package: { name: string; ecosystem: string }
  page_token?: string
}

type OsvQueryResponse = {
  vulns?: OsvVulnerability[]
  next_page_token?: string
}

const client = axios.create({
  baseURL: 'https://api.osv.dev',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.OSV,
})

export async function fetchPackageVulnerabilities(
  packageName: string,
): Promise<OsvVulnerability[]> {
  const vulns: OsvVulnerability[] = []
  let pageToken: string | undefined

  for (let page = 0; page < MAX_OSV_PAGES; page += 1) {
    const payload: OsvQueryRequest = {
      package: {
        name: packageName,
        ecosystem: 'npm',
      },
    }

    if (pageToken) {
      payload.page_token = pageToken
    }

    const { data } = await client.post<OsvQueryResponse>('/v1/query', payload)

    for (const vuln of data.vulns ?? []) {
      if (!vuln.withdrawn) {
        vulns.push(vuln)
      }
    }

    if (!data.next_page_token) break

    pageToken = data.next_page_token
  }

  return vulns
}
