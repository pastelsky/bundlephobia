import axios from 'axios'

import config from '../config'
import { getEscapedNpmPackageName } from '../packages/npm-package'

export type NpmDownloadPoint = { day: string; downloads: number }

type NpmRangeResponse = { downloads?: NpmDownloadPoint[] }

// The npm downloads API silently truncates large range requests to its
// retention window. Keep requests to one year so callers can retrieve longer
// histories by stitching together bounded ranges.
const MAX_RANGE_DAYS = 365

const client = axios.create({
  baseURL: 'https://api.npmjs.org',
  timeout: config.EXTERNAL_SERVICES.TIMEOUT_MS.NPM_DOWNLOADS,
})

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function splitNpmDateRange(range: string): string[] {
  const match = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(range)

  if (!match) return [range]

  const start = new Date(`${match[1]}T00:00:00Z`)
  const end = new Date(`${match[2]}T00:00:00Z`)

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return [range]

  if (start > end) return [range]

  const ranges: string[] = []
  let chunkStart = start

  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + MAX_RANGE_DAYS - 1)

    if (chunkEnd > end) chunkEnd.setTime(end.getTime())

    ranges.push(`${isoDate(chunkStart)}:${isoDate(chunkEnd)}`)

    chunkStart = new Date(chunkEnd)
    chunkStart.setUTCDate(chunkStart.getUTCDate() + 1)
  }

  return ranges
}

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

    for (const point of data.downloads || [])
      pointsByDay.set(point.day, point)
  }

  return [...pointsByDay.values()].sort((a, b) =>
    a.day.localeCompare(b.day),
  )
}
