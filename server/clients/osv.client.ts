import axios from 'axios'
import config from '../config'

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
  summary?: string
  published: string
  modified?: string
  database_specific?: {
    severity?: string
  }
  affected?: OsvAffected[]
}

export type OsvQueryResponse = {
  vulns?: OsvVulnerability[]
}

const client = axios.create({
  baseURL: 'https://api.osv.dev',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.NPM_DOWNLOADS,
})

export async function fetchPackageVulnerabilities(
  packageName: string,
): Promise<OsvVulnerability[]> {
  try {
    const { data } = await client.post<OsvQueryResponse>('/v1/query', {
      package: {
        name: packageName,
        ecosystem: 'npm',
      },
    })

    return data.vulns ?? []
  } catch {
    return []
  }
}
