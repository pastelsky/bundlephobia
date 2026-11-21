import {
  clearTrendsDownloadsCache,
  fetchTrendsDownloads,
  getCachedPackageDownloads,
} from '../pages/trends/trendsDownloadsClient'
import { getNpmTrendsRange, splitNpmDateRange } from '../utils/trends'

const STORAGE_KEY = 'bundlephobia:trends:downloads:v1'

function createMemoryStorage() {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  } satisfies Storage
}

function buildDailySeries(
  startDate: string,
  days: number,
  dailyValue: (dayIndex: number) => number,
) {
  const result: Array<{ day: string; downloads: number }> = []
  const current = new Date(`${startDate}T00:00:00Z`)

  for (let index = 0; index < days; index++) {
    result.push({
      day: current.toISOString().slice(0, 10),
      downloads: dailyValue(index),
    })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return result
}

const originalFetch = globalThis.fetch

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
)

let mockStorage: Storage

let fetchMock: jest.Mock<
  Promise<Response>,
  [input: RequestInfo | URL, init?: RequestInit]
>

beforeEach(() => {
  mockStorage = createMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: mockStorage,
  })
  fetchMock = jest.fn()
  globalThis.fetch = fetchMock
  clearTrendsDownloadsCache()
})

afterEach(() => {
  clearTrendsDownloadsCache()
  globalThis.fetch = originalFetch

  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      'localStorage',
      originalLocalStorageDescriptor,
    )
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

describe('trends client downloads cache', () => {
  it('fetches headerless requests from api.npmjs.org and encodes scoped packages', async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const npmRange = getNpmTrendsRange('last-2-months', now)
    const [rangeStart] = npmRange.split(':')

    const series = buildDailySeries(rangeStart, 10, index =>
      index >= 8 ? 0 : 1000 + index * 100,
    )

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    const results = await fetchTrendsDownloads(
      ['@tanstack/react-query'],
      'last-2-months',
      { now },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]

    expect(String(requestUrl)).toBe(
      `https://api.npmjs.org/downloads/range/${npmRange}/%40tanstack%2Freact-query`,
    )
    expect(requestInit?.headers).toBeUndefined()

    const pkgResult = results.get('@tanstack/react-query')

    expect(pkgResult).toBeDefined()
    // Trailing two zero-download days should be trimmed
    expect(pkgResult?.downloads).toHaveLength(8)
    // Last 7 days: indices 1..7 -> 1100 + 1200 + 1300 + 1400 + 1500 + 1600 + 1700 = 9800
    expect(pkgResult?.weeklyDownloads).toBe(9800)
    expect(pkgResult?.warning).toBeUndefined()
  })

  it('splits multi-year requests into year chunks and merges points', async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const chunks = splitNpmDateRange(getNpmTrendsRange('last-3-years', now))

    expect(chunks.length).toBeGreaterThan(1)

    fetchMock.mockImplementation(async url => {
      const urlText = String(url)
      const chunkIndex = chunks.findIndex(chunk => urlText.includes(chunk))
      const chunkStart = chunks[chunkIndex].split(':')[0]

      return new Response(
        JSON.stringify({
          downloads: [{ day: chunkStart, downloads: 5000 + chunkIndex }],
        }),
        { status: 200 },
      )
    })

    const results = await fetchTrendsDownloads(['react'], 'last-3-years', {
      now,
    })

    expect(fetchMock).toHaveBeenCalledTimes(chunks.length)
    expect(results.get('react')?.downloads).toHaveLength(chunks.length)
  })

  it('persists entries in localStorage and rehydrates within 6h same-UTC-day TTL', async () => {
    const firstVisit = new Date('2026-11-21T08:00:00Z')

    const [rangeStart] = getNpmTrendsRange('last-2-months', firstVisit).split(
      ':',
    )

    const series = buildDailySeries(rangeStart, 14, () => 2500)

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    await fetchTrendsDownloads(['vue'], 'last-2-months', { now: firstVisit })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockStorage.getItem(STORAGE_KEY)).toBeTruthy()

    // Simulate a fresh page reload by clearing only in-memory cache while preserving storage
    const persisted = mockStorage.getItem(STORAGE_KEY)
    clearTrendsDownloadsCache()

    if (persisted) mockStorage.setItem(STORAGE_KEY, persisted)

    const withinTtl = new Date('2026-11-21T12:00:00Z')

    const syncCached = getCachedPackageDownloads(
      'vue',
      'last-2-months',
      withinTtl,
    )

    expect(syncCached?.downloads).toHaveLength(14)

    const secondResults = await fetchTrendsDownloads(['vue'], 'last-2-months', {
      now: withinTtl,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(secondResults.get('vue')?.weeklyDownloads).toBe(17500)

    // After 6h or on next UTC day, cache refreshes via network
    const nextDay = new Date('2026-11-22T01:00:00Z')
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    await fetchTrendsDownloads(['vue'], 'last-2-months', { now: nextDay })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reuses superset cached ranges (last-year -> last-2-months) without refetching', async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const yearRange = getNpmTrendsRange('last-year', now)
    const [yearStart] = yearRange.split(':')
    const chunks = splitNpmDateRange(yearRange)
    const [twoMonthStart] = getNpmTrendsRange('last-2-months', now).split(':')
    const yearSeries = buildDailySeries(yearStart, 366, () => 4000)

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ downloads: yearSeries }), {
          status: 200,
        }),
    )

    await fetchTrendsDownloads(['svelte'], 'last-year', { now })
    expect(fetchMock).toHaveBeenCalledTimes(chunks.length)

    const sliced = await fetchTrendsDownloads(['svelte'], 'last-2-months', {
      now,
    })

    expect(fetchMock).toHaveBeenCalledTimes(chunks.length)

    const downloads = sliced.get('svelte')?.downloads ?? []

    expect(downloads.length).toBeGreaterThan(0)
    expect(downloads.every(point => point.date >= twoMonthStart)).toBe(true)
  })

  it('deduplicates concurrent in-flight requests for the same package and range', async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const [rangeStart] = getNpmTrendsRange('last-2-months', now).split(':')
    const series = buildDailySeries(rangeStart, 7, () => 1200)

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    const [first, second] = await Promise.all([
      fetchTrendsDownloads(['lodash'], 'last-2-months', { now }),
      fetchTrendsDownloads(['lodash'], 'last-2-months', { now }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.get('lodash')?.weeklyDownloads).toBe(8400)
    expect(second.get('lodash')?.weeklyDownloads).toBe(8400)
  })

  it('falls back to stale cache (<24h) on 429 and returns graceful warning on cold failure', async () => {
    const initialTime = new Date('2026-11-21T02:00:00Z')
    const staleFallbackTime = new Date('2026-11-21T15:00:00Z')
    const expiredFallbackTime = new Date('2026-11-22T15:00:00Z')

    const [rangeStart] = getNpmTrendsRange('last-2-months', initialTime).split(
      ':',
    )

    const series = buildDailySeries(rangeStart, 7, () => 3000)

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    await fetchTrendsDownloads(['preact'], 'last-2-months', {
      now: initialTime,
    })

    fetchMock.mockResolvedValueOnce(
      new Response('Rate limited', { status: 429 }),
    )

    const staleResult = await fetchTrendsDownloads(
      ['preact'],
      'last-2-months',
      { now: staleFallbackTime },
    )

    expect(staleResult.get('preact')?.downloads).toHaveLength(7)
    expect(staleResult.get('preact')?.warning).toContain('cached')

    fetchMock.mockResolvedValueOnce(
      new Response('Rate limited', { status: 429 }),
    )

    const coldOrExpired = await fetchTrendsDownloads(
      ['solid-js'],
      'last-2-months',
      { now: expiredFallbackTime },
    )

    expect(coldOrExpired.get('solid-js')?.downloads).toEqual([])
    expect(coldOrExpired.get('solid-js')?.weeklyDownloads).toBeNull()
    expect(coldOrExpired.get('solid-js')?.warning).toContain('429')
  })

  it('prunes least recently used entries past the 30-entry limit', async () => {
    const baseTime = new Date('2026-11-21T10:00:00Z')
    const [rangeStart] = getNpmTrendsRange('last-2-months', baseTime).split(':')
    const series = buildDailySeries(rangeStart, 7, () => 500)

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    for (let index = 0; index < 31; index++) {
      await fetchTrendsDownloads([`pkg-${index}`], 'last-2-months', {
        now: new Date(baseTime.getTime() + index),
      })
    }

    const checkTime = new Date(baseTime.getTime() + 50)

    expect(
      getCachedPackageDownloads('pkg-0', 'last-2-months', checkTime),
    ).toBeNull()
    expect(
      getCachedPackageDownloads('pkg-1', 'last-2-months', checkTime),
    ).not.toBeNull()
    expect(
      getCachedPackageDownloads('pkg-30', 'last-2-months', checkTime),
    ).not.toBeNull()
  })
})
