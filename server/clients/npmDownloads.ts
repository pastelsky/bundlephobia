import axios from 'axios'

import config from '../config'
import { getEscapedNpmPackageName } from '../packages/npmPackage'

export type NpmDownloadPoint = { day: string; downloads: number }

type NpmRangeResponse = { downloads?: NpmDownloadPoint[] }

const client = axios.create({
  baseURL: 'https://api.npmjs.org',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.NPM_DOWNLOADS,
})

export async function fetchNpmDownloadRange(
  packageName: string,
  range: string
): Promise<NpmDownloadPoint[]> {
  const { data } = await client.get<NpmRangeResponse>(
    `/downloads/range/${range}/${getEscapedNpmPackageName(packageName)}`
  )
  return data.downloads || []
}
