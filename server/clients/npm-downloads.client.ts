import axios from 'axios'

import config from '../config'
import { getEscapedNpmPackageName } from '../packages/npm-package'
import { splitNpmDateRange } from '../../utils/trends'

export { splitNpmDateRange }

export type NpmDownloadPoint = { day: string; downloads: number }

type NpmRangeResponse = { downloads?: NpmDownloadPoint[] }

const client = axios.create({
  baseURL: 'https://api.npmjs.org',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.NPM_DOWNLOADS,
})

export async function fetchNpmDownloadRange(
  packageName: string,
  range: string,
): Promise<NpmDownloadPoint[]> {
  const packagePath = getEscapedNpmPackageName(packageName)
  const ranges = splitNpmDateRange(range)
  const pointsByDay = new Map<string, NpmDownloadPoint>()

  for (const chunk of ranges) {
    const { data } = await client.get<NpmRangeResponse>(
      `/downloads/range/${chunk}/${packagePath}`,
    )

    for (const point of data.downloads || []) pointsByDay.set(point.day, point)
  }

  return [...pointsByDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}
