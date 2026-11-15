import axios from 'axios'
import config from '../config'

export type OsvVulnerability = {
  id: string
  summary?: string
  published: string
  database_specific?: {
    severity?: string
  }
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
