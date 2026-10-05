import axios from 'axios'
import { addDays, format, isAfter, isValid, parseISO } from 'date-fns'

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
  return format(date, 'yyyy-MM-dd')
}

export function splitNpmDateRange(range: string): string[] {
  const match = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(range)

  if (!match) return [range]

  const start = parseISO(match[1])
  const end = parseISO(match[2])

  if (!isValid(start) || !isValid(end)) return [range]

  if (isAfter(start, end)) return [range]

  const ranges: string[] = []
  let chunkStart = start

  while (!isAfter(chunkStart, end)) {
    const proposedEnd = addDays(chunkStart, MAX_RANGE_DAYS - 1)
    const chunkEnd = isAfter(proposedEnd, end) ? end : proposedEnd

    ranges.push(`${isoDate(chunkStart)}:${isoDate(chunkEnd)}`)

    chunkStart = addDays(chunkEnd, 1)
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

    for (const point of data.downloads || []) pointsByDay.set(point.day, point)
  }

  return [...pointsByDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}
