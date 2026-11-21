import {
  clearTrendsDownloadsCache,
  fetchTrendsDownloads,
  getCachedPackageDownloads,
} from '../pages/trends/trendsDownloadsClient'
import { getNpmTrendsRange, splitNpmDateRange } from '../utils/trends'

const STORAGE_KEY = 'bundlephobia:trends:downloads:v1'

function buildDailySeries(startDate: string, days: number, value: number) {
  const startMs = Date.parse(`${startDate}T00:00:00Z`)

  return Array.from({ length: days }, (_, index) => ({
    day: new Date(startMs + index * 86_400_000).toISOString().slice(0, 10),
    downloads: value,
  }))
}

const originalFetch = globalThis.fetch

const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
)

let store = new Map<string, string>()

let fetchMock: jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>

beforeEach(() => {
  store = new Map()

  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: key => store.get(key) ?? null,
    key: index => [...store.keys()][index] ?? null,
    removeItem: key => void store.delete(key),
    setItem: (key, value) => void store.set(key, value),
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  fetchMock = jest.fn()
  globalThis.fetch = fetchMock
  clearTrendsDownloadsCache()
})

afterEach(() => {
  clearTrendsDownloadsCache()
  globalThis.fetch = originalFetch

  if (originalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalStorage)
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

describe('trends client downloads cache', () => {
  it('fetches headerless requests for scoped packages and trims trailing zero days', async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const npmRange = getNpmTrendsRange('last-2-months', now)
    const [start] = npmRange.split(':')

    const series = [
      ...buildDailySeries(start, 8, 1000),
      ...buildDailySeries('2026-09-29', 2, 0),
    ]

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    const results = await fetchTrendsDownloads(
      ['@tanstack/react-query'],
      'last-2-months',
      { now },
    )

    const [url, init] = fetchMock.mock.calls[0]

    expect(String(url)).toBe(
      `https://api.npmjs.org/downloads/range/${npmRange}/%40tanstack%2Freact-query`,
    )
    expect(init?.headers).toBeUndefined()
    expect(results.get('@tanstack/react-query')).toEqual({
      downloads: expect.arrayContaining([
        expect.objectContaining({ value: 1000 }),
      ]),
      weeklyDownloads: 7000,
    })
    expect(results.get('@tanstack/react-query')?.downloads).toHaveLength(8)
  })

  it('persists to localStorage across reloads and expires on the next UTC day', async () => {
    const visit = new Date('2026-11-21T08:00:00Z')
    const [start] = getNpmTrendsRange('last-2-months', visit).split(':')
    const series = buildDailySeries(start, 7, 2500)

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    await fetchTrendsDownloads(['vue'], 'last-2-months', { now: visit })

    const persisted = store.get(STORAGE_KEY)

    expect(persisted).toBeTruthy()

    // Reset memory cache only to simulate a browser reload
    clearTrendsDownloadsCache()

    if (persisted) store.set(STORAGE_KEY, persisted)

    const sameDay = new Date('2026-11-21T12:00:00Z')

    expect(
      getCachedPackageDownloads('vue', 'last-2-months', sameDay)?.downloads,
    ).toHaveLength(7)

    await fetchTrendsDownloads(['vue'], 'last-2-months', { now: sameDay })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await fetchTrendsDownloads(['vue'], 'last-2-months', {
      now: new Date('2026-11-22T01:00:00Z'),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reuses cached last-year data when switching to last-2-months', async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const yearRange = getNpmTrendsRange('last-year', now)
    const [yearStart] = yearRange.split(':')
    const [twoMonthStart] = getNpmTrendsRange('last-2-months', now).split(':')
    const series = buildDailySeries(yearStart, 366, 4000)

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ downloads: series }), { status: 200 }),
    )

    await fetchTrendsDownloads(['svelte'], 'last-year', { now })
    const chunks = splitNpmDateRange(yearRange).length
    expect(fetchMock).toHaveBeenCalledTimes(chunks)

    const sliced = await fetchTrendsDownloads(['svelte'], 'last-2-months', {
      now,
    })

    expect(fetchMock).toHaveBeenCalledTimes(chunks)
    expect(
      sliced
        .get('svelte')
        ?.downloads.every(point => point.date >= twoMonthStart),
    ).toBe(true)
  })

  it('falls back to stale cache (<24h) on 429 and returns a warning on cold failure', async () => {
    const initial = new Date('2026-11-21T02:00:00Z')
    const [start] = getNpmTrendsRange('last-2-months', initial).split(':')

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ downloads: buildDailySeries(start, 7, 3000) }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))

    await fetchTrendsDownloads(['preact'], 'last-2-months', { now: initial })

    const stale = await fetchTrendsDownloads(['preact'], 'last-2-months', {
      now: new Date('2026-11-21T15:00:00Z'),
    })

    expect(stale.get('preact')?.downloads).toHaveLength(7)
    expect(stale.get('preact')?.warning).toContain('cached')

    const cold = await fetchTrendsDownloads(['solid-js'], 'last-2-months', {
      now: new Date('2026-11-22T15:00:00Z'),
    })

    expect(cold.get('solid-js')).toEqual({
      downloads: [],
      weeklyDownloads: null,
      warning: expect.stringContaining('429'),
    })
  })
})
