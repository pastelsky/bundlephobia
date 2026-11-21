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
} from '../../utils/trends'

const STORAGE_KEY = 'bundlephobia:trends:downloads:v1'

const FRESH_TTL_MS = 6 * 60 * 60 * 1000

const STALE_TTL_MS = 24 * 60 * 60 * 1000

const MAX_PERSISTED_ENTRIES = 30

const RANGE_SUPERSETS: Record<TrendsRange, TrendsRange[]> = {
  'last-2-months': ['last-2-months', 'last-year', 'last-3-years'],
  'last-year': ['last-year', 'last-3-years'],
  'last-3-years': ['last-3-years'],
}

const CacheStoreSchema = z.record(
  z.string(),
  z.object({
    fetchedAt: z.number(),
    points: z.array(z.object({ date: z.string(), value: z.number() })),
  }),
)

const NpmResponseSchema = z.object({
  downloads: z
    .array(z.object({ day: z.string(), downloads: z.number() }))
    .default([]),
})

type CacheEntry = z.infer<typeof CacheStoreSchema>[string]

export type PackageDownloadsResult = {
  downloads: TrendsPoint[]
  weeklyDownloads: number | null
  warning?: string
}

const memoryCache = new Map<string, CacheEntry>()

const inFlightRequests = new Map<string, Promise<PackageDownloadsResult>>()

let hydratedFromStorage = false

const cacheKey = (packageName: string, range: TrendsRange) =>
  `${packageName.trim().toLowerCase()}|${range}`

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

  try {
    const raw = getStorage()?.getItem(STORAGE_KEY)

    if (!raw) return

    const parsed = CacheStoreSchema.safeParse(JSON.parse(raw))

    if (!parsed.success) return

    for (const [key, entry] of Object.entries(parsed.data)) {
      memoryCache.set(key, entry)
    }
  } catch {
    // Corrupted localStorage or restricted storage access should not block UI.
  }
}

function persistMemoryCache(nowMs: number): void {
  for (const [key, entry] of memoryCache.entries()) {
    if (nowMs - entry.fetchedAt >= STALE_TTL_MS) {
      memoryCache.delete(key)
    }
  }

  while (memoryCache.size > MAX_PERSISTED_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value

    if (!oldestKey) break

    memoryCache.delete(oldestKey)
  }

  try {
    getStorage()?.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(memoryCache)),
    )
  } catch {
    // Ignore storage quota or private browsing write failures.
  }
}

function readCachedPoints(
  packageName: string,
  range: TrendsRange,
  options: { allowStale: boolean; now: Date },
): TrendsPoint[] | null {
  hydrateMemoryCache()

  const nowMs = options.now.getTime()
  const todayUtc = formatTrendsDate(options.now)

  for (const candidateRange of RANGE_SUPERSETS[range]) {
    const key = cacheKey(packageName, candidateRange)
    const entry = memoryCache.get(key)

    if (!entry) continue

    const age = nowMs - entry.fetchedAt

    const isFresh =
      age < FRESH_TTL_MS &&
      formatTrendsDate(new Date(entry.fetchedAt)) === todayUtc

    if (!isFresh && !(options.allowStale && age < STALE_TTL_MS)) continue

    // Refresh insertion order for O(1) LRU tracking
    memoryCache.delete(key)
    memoryCache.set(key, entry)

    if (candidateRange === range) return entry.points

    const startDate = startOfTrendsRangeDate(range, options.now)

    return entry.points.filter(point => point.date >= startDate)
  }

  return null
}

function toDownloadsResult(
  downloads: TrendsPoint[],
  warning?: string,
): PackageDownloadsResult {
  const result: PackageDownloadsResult = {
    downloads,
    weeklyDownloads: computeWeeklyDownloads(downloads),
  }

  if (warning) result.warning = warning

  return result
}

async function fetchNpmChunks(
  packageName: string,
  range: TrendsRange,
  options: { signal?: AbortSignal; now: Date },
): Promise<TrendsPoint[]> {
  const encodedPkg = encodeURIComponent(packageName.trim())
  const chunks = splitNpmDateRange(getNpmTrendsRange(range, options.now))

  const chunkResponses = await Promise.all(
    chunks.map(async chunk => {
      // Plain headerless GET avoids triggering an OPTIONS preflight on
      // api.npmjs.org (which returns 404 on OPTIONS).
      const response = await fetch(
        `https://api.npmjs.org/downloads/range/${chunk}/${encodedPkg}`,
        options.signal ? { signal: options.signal } : undefined,
      )

      if (!response.ok) {
        throw new Error(`npm downloads request failed (${response.status})`)
      }

      return NpmResponseSchema.parse(await response.json()).downloads
    }),
  )

  const pointsByDay = new Map<string, number>()

  for (const chunkPoints of chunkResponses) {
    for (const point of chunkPoints) {
      pointsByDay.set(point.day, point.downloads)
    }
  }

  const sorted = [...pointsByDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, downloads]) => ({ day, downloads }))

  return normalizeNpmDownloadPoints(sorted)
}

export function getCachedPackageDownloads(
  packageName: string,
  range: TrendsRange,
  now = new Date(),
): PackageDownloadsResult | null {
  const points = readCachedPoints(packageName, range, {
    allowStale: false,
    now,
  })

  return points ? toDownloadsResult(points) : null
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
      const points = await fetchNpmChunks(packageName, range, {
        signal: options.signal,
        now,
      })

      const fetchedAt = now.getTime()
      memoryCache.set(key, { fetchedAt, points })
      persistMemoryCache(fetchedAt)

      return toDownloadsResult(points)
    } catch (error) {
      const stale = readCachedPoints(packageName, range, {
        allowStale: true,
        now,
      })

      if (stale) {
        return toDownloadsResult(
          stale,
          'Showing cached npm download history while api.npmjs.org is unavailable',
        )
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
    packages.map(
      async pkg =>
        [pkg, await fetchPackageDownloads(pkg, range, options)] as const,
    ),
  )

  return new Map(entries)
}

export function clearTrendsDownloadsCache(): void {
  memoryCache.clear()
  inFlightRequests.clear()
  hydratedFromStorage = false

  try {
    getStorage()?.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage access errors in restricted environments.
  }
}
