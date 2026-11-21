import { z } from 'zod'
import type {
  TrendsPoint,
  TrendsRange,
} from '@bundlephobia/service-contracts/trends'

import {
  computeWeeklyDownloads,
  formatTrendsDate,
  getNpmTrendsRange,
  normalizeNpmDownloadPoints,
  splitNpmDateRange,
  startOfTrendsRangeDate,
  type NpmDownloadPoint,
} from '../../utils/trends'

const STORAGE_KEY = 'bundlephobia:trends:downloads:v1'

const STORAGE_VERSION = 1

const FRESH_TTL_MS = 6 * 60 * 60 * 1000

const STALE_TTL_MS = 24 * 60 * 60 * 1000

const MAX_PERSISTED_ENTRIES = 30

const RANGE_SUPERSETS: Record<TrendsRange, TrendsRange[]> = {
  'last-2-months': ['last-2-months', 'last-year', 'last-3-years'],
  'last-year': ['last-year', 'last-3-years'],
  'last-3-years': ['last-3-years'],
}

const TrendsRangeSchema = z.enum(['last-2-months', 'last-year', 'last-3-years'])

const PersistedDownloadsEntrySchema = z.object({
  packageName: z.string(),
  range: TrendsRangeSchema,
  fetchedAt: z.number(),
  lastAccessedAt: z.number(),
  utcDate: z.string(),
  points: z.array(
    z.object({
      date: z.string(),
      value: z.number(),
    }),
  ),
})

const PersistedDownloadsStoreSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  entries: z.record(z.string(), z.unknown()),
})

const NpmRangeApiResponseSchema = z.object({
  downloads: z
    .array(
      z.object({
        day: z.string(),
        downloads: z.number(),
      }),
    )
    .optional(),
})

type PersistedDownloadsEntry = z.infer<typeof PersistedDownloadsEntrySchema>

export type PackageDownloadsResult = {
  downloads: TrendsPoint[]
  weeklyDownloads: number | null
  warning?: string
}

const memoryCache = new Map<string, PersistedDownloadsEntry>()

const inFlightRequests = new Map<string, Promise<PackageDownloadsResult>>()

let hydratedFromStorage = false

function cacheKey(packageName: string, range: TrendsRange): string {
  return `${packageName.trim().toLowerCase()}|${range}`
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function hydrateMemoryCache(): void {
  if (hydratedFromStorage) return

  hydratedFromStorage = true
  const storage = getStorage()

  if (!storage) return

  try {
    const raw = storage.getItem(STORAGE_KEY)

    if (!raw) return

    const parsedStore = PersistedDownloadsStoreSchema.safeParse(JSON.parse(raw))

    if (!parsedStore.success) return

    for (const [key, candidate] of Object.entries(parsedStore.data.entries)) {
      const parsedEntry = PersistedDownloadsEntrySchema.safeParse(candidate)

      if (parsedEntry.success) {
        memoryCache.set(key, parsedEntry.data)
      }
    }
  } catch {
    // Corrupted localStorage or restricted storage access should not block UI.
  }
}

function pruneExpiredEntries(now: number): void {
  for (const [key, entry] of memoryCache.entries()) {
    if (now - entry.fetchedAt >= STALE_TTL_MS) {
      memoryCache.delete(key)
    }
  }
}

function persistMemoryCache(now: number): void {
  const storage = getStorage()

  if (!storage) return

  pruneExpiredEntries(now)

  const sorted = [...memoryCache.entries()].sort(
    ([, left], [, right]) => right.lastAccessedAt - left.lastAccessedAt,
  )

  const trimmed = sorted.slice(0, MAX_PERSISTED_ENTRIES)
  memoryCache.clear()

  const entries: Record<string, PersistedDownloadsEntry> = {}

  for (const [key, entry] of trimmed) {
    memoryCache.set(key, entry)
    entries[key] = entry
  }

  const writeStore = (
    storeEntries: Record<string, PersistedDownloadsEntry>,
  ) => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, entries: storeEntries }),
    )
  }

  try {
    writeStore(entries)
  } catch {
    // Retry once with half the entries in case localStorage quota is tight.
    const compact = Object.fromEntries(
      trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2))),
    )

    try {
      writeStore(compact)
    } catch {
      // Ignore storage failures when private browsing disallows writes.
    }
  }
}

function sliceEntryForRange(
  entry: PersistedDownloadsEntry,
  targetRange: TrendsRange,
  now: Date,
): TrendsPoint[] {
  if (entry.range === targetRange) return entry.points

  const startDate = startOfTrendsRangeDate(targetRange, now)

  return entry.points.filter(point => point.date >= startDate)
}

function findEntry(
  packageName: string,
  range: TrendsRange,
  options: { allowStale: boolean; now: Date },
): PersistedDownloadsEntry | null {
  hydrateMemoryCache()

  const nowMs = options.now.getTime()
  const todayUtc = formatTrendsDate(options.now)

  for (const candidateRange of RANGE_SUPERSETS[range]) {
    const key = cacheKey(packageName, candidateRange)
    const entry = memoryCache.get(key)

    if (!entry) continue

    const age = nowMs - entry.fetchedAt
    const isFresh = entry.utcDate === todayUtc && age < FRESH_TTL_MS
    const isStaleUsable = age < STALE_TTL_MS

    if (isFresh || (options.allowStale && isStaleUsable)) {
      entry.lastAccessedAt = nowMs

      return entry
    }
  }

  return null
}

function toDownloadsResult(
  entry: PersistedDownloadsEntry,
  range: TrendsRange,
  options: { now: Date; warning?: string },
): PackageDownloadsResult {
  const downloads = sliceEntryForRange(entry, range, options.now)

  const result: PackageDownloadsResult = {
    downloads,
    weeklyDownloads: computeWeeklyDownloads(downloads),
  }

  if (options.warning) {
    result.warning = options.warning
  }

  return result
}

export function getCachedPackageDownloads(
  packageName: string,
  range: TrendsRange,
  now = new Date(),
): PackageDownloadsResult | null {
  const entry = findEntry(packageName, range, { allowStale: false, now })

  if (!entry) return null

  return toDownloadsResult(entry, range, { now })
}

async function fetchNpmChunksFromOrigin(
  packageName: string,
  range: TrendsRange,
  options: { signal?: AbortSignal; now: Date },
): Promise<TrendsPoint[]> {
  const encodedPackage = encodeURIComponent(packageName.trim())
  const chunks = splitNpmDateRange(getNpmTrendsRange(range, options.now))
  const pointsByDay = new Map<string, NpmDownloadPoint>()

  for (const chunk of chunks) {
    // Plain headerless GET avoids triggering an OPTIONS preflight on
    // api.npmjs.org (which returns 404 on OPTIONS).
    const response = await fetch(
      `https://api.npmjs.org/downloads/range/${chunk}/${encodedPackage}`,
      options.signal ? { signal: options.signal } : undefined,
    )

    if (!response.ok) {
      throw new Error(`npm downloads request failed (${response.status})`)
    }

    const data = NpmRangeApiResponseSchema.parse(await response.json())

    for (const point of data.downloads ?? []) {
      pointsByDay.set(point.day, point)
    }
  }

  const sorted = [...pointsByDay.values()].sort((left, right) =>
    left.day.localeCompare(right.day),
  )

  return normalizeNpmDownloadPoints(sorted)
}

export async function fetchPackageDownloads(
  packageName: string,
  range: TrendsRange,
  options: { signal?: AbortSignal; now?: Date } = {},
): Promise<PackageDownloadsResult> {
  const now = options.now ?? new Date()
  const fresh = getCachedPackageDownloads(packageName, range, now)

  if (fresh) return fresh

  const key = cacheKey(packageName, range)
  const existing = inFlightRequests.get(key)

  if (existing) return existing

  const request = (async (): Promise<PackageDownloadsResult> => {
    try {
      const points = await fetchNpmChunksFromOrigin(packageName, range, {
        signal: options.signal,
        now,
      })

      const fetchedAt = now.getTime()

      const entry: PersistedDownloadsEntry = {
        packageName: packageName.trim().toLowerCase(),
        range,
        fetchedAt,
        lastAccessedAt: fetchedAt,
        utcDate: formatTrendsDate(now),
        points,
      }

      memoryCache.set(key, entry)
      persistMemoryCache(fetchedAt)

      return {
        downloads: points,
        weeklyDownloads: computeWeeklyDownloads(points),
      }
    } catch (error) {
      const stale = findEntry(packageName, range, { allowStale: true, now })

      if (stale) {
        return toDownloadsResult(stale, range, {
          now,
          warning:
            'Showing cached npm download history while api.npmjs.org is unavailable',
        })
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      return {
        downloads: [],
        weeklyDownloads: null,
        warning:
          error instanceof Error
            ? error.message
            : 'npm download history is unavailable',
      }
    } finally {
      inFlightRequests.delete(key)
    }
  })()

  inFlightRequests.set(key, request)

  return request
}

export async function fetchTrendsDownloads(
  packages: string[],
  range: TrendsRange,
  options: { signal?: AbortSignal; now?: Date } = {},
): Promise<Map<string, PackageDownloadsResult>> {
  const entries = await Promise.all(
    packages.map(async packageName => {
      const result = await fetchPackageDownloads(packageName, range, options)

      return [packageName, result] as const
    }),
  )

  return new Map(entries)
}

export function clearTrendsDownloadsCache(): void {
  memoryCache.clear()
  inFlightRequests.clear()
  hydratedFromStorage = false

  const storage = getStorage()

  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage access errors in restricted environments.
    }
  }
}
