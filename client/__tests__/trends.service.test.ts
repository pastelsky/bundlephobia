import API from '../api'
import {
  clearClientTrendsCache,
  fetchGithubStarCount,
  fetchGithubStarHistory,
  fetchNpmDownloads,
  fetchTrends,
  getCachedTrendsSeries,
  setCachedTrendsSeries,
} from '../trends.service'
import type { TrendsPackageSeries } from '@bundlephobia/service-contracts/trends'

describe('client trends service', () => {
  beforeEach(() => {
    clearClientTrendsCache()
    jest.restoreAllMocks()
  })

  it('stores and retrieves cached series within TTL', () => {
    const series: TrendsPackageSeries = {
      name: 'react',
      repository: 'facebook/react',
      downloads: [{ date: '2026-09-14', value: 100 }],
      stars: [{ date: '2026-09-14', value: 200 }],
      size: [],
      releases: [],
      current: {
        weeklyDownloads: 100,
        stars: 200,
        size: 10,
        gzip: 5,
      },
      warnings: [],
    }

    setCachedTrendsSeries('react', 'last-year', series, 1000)
    expect(getCachedTrendsSeries('react', 'last-year', 1500)).toEqual(series)
    // After 10m TTL (600,000ms), complete cache should expire
    expect(
      getCachedTrendsSeries('react', 'last-year', 1000 + 600_001),
    ).toBeNull()
  })

  it('uses a shorter 30s TTL for degraded series with warnings', () => {
    const degradedSeries: TrendsPackageSeries = {
      name: 'react',
      repository: 'facebook/react',
      downloads: [],
      stars: [],
      size: [],
      releases: [],
      current: {
        weeklyDownloads: null,
        stars: null,
        size: null,
        gzip: null,
      },
      warnings: ['GitHub star history is unavailable'],
    }

    setCachedTrendsSeries('react', 'last-year', degradedSeries, 1000)
    expect(getCachedTrendsSeries('react', 'last-year', 1500)).toEqual(
      degradedSeries,
    )
    // After 30s TTL (30,000ms), degraded cache should expire
    expect(
      getCachedTrendsSeries('react', 'last-year', 1000 + 30_001),
    ).toBeNull()
  })

  it('fetches npm downloads from api.npmjs.org', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        start: '2026-09-01',
        end: '2026-09-02',
        package: 'react',
        downloads: [
          { day: '2026-09-01', downloads: 10 },
          { day: '2026-09-02', downloads: 20 },
        ],
      }),
    })

    const points = await fetchNpmDownloads('react', 'last-2-months', mockFetch)
    expect(points).toEqual([
      { date: '2026-09-01', value: 10 },
      { date: '2026-09-02', value: 20 },
    ])
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.npmjs.org/downloads/range/'),
    )
  })

  it('fetches GitHub star count and history', async () => {
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/stargazers/count')) {
        return {
          ok: true,
          json: async () => ({ count: 100 }),
        }
      }

      if (url.includes('/stargazers/history')) {
        const week = Date.parse('2026-09-13T00:00:00Z') / 1000

        return {
          ok: true,
          headers: new Headers(),
          json: async () => [{ week, total: 5, days: [1, 2, 0, 0, 1, 1, 0] }],
        }
      }

      throw new Error(`Unexpected url: ${url}`)
    })

    const count = await fetchGithubStarCount('facebook/react', mockFetch)
    expect(count).toBe(100)

    const history = await fetchGithubStarHistory(
      'facebook/react',
      '2026-09-13',
      mockFetch,
    )

    expect(history.length).toBeGreaterThan(0)
    expect(history.at(-1)?.value).toBe(100)
  })

  it('falls back to client-side resolution when server returns degraded data', async () => {
    const degradedServerSeries: TrendsPackageSeries = {
      name: 'react',
      repository: 'facebook/react',
      downloads: [{ date: '2026-09-14', value: 50 }],
      stars: [],
      size: [{ date: '2026-09-14', value: 10, version: '19.0.0' }],
      releases: [],
      current: {
        weeklyDownloads: 50,
        stars: null,
        size: 10,
        gzip: 5,
      },
      warnings: ['GitHub star history is unavailable'],
    }

    jest.spyOn(API, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/trends')) {
        return {
          packages: [degradedServerSeries],
          range: 'last-year',
          generatedAt: new Date().toISOString(),
        }
      }

      throw new Error(`Unexpected API.get url: ${url}`)
    })

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/stargazers/count')) {
        return {
          ok: true,
          json: async () => ({ count: 500 }),
        }
      }

      if (url.includes('/stargazers/history')) {
        const week = Date.parse('2026-09-13T00:00:00Z') / 1000

        return {
          ok: true,
          headers: new Headers(),
          json: async () => [{ week, total: 5, days: [1, 2, 0, 0, 1, 1, 0] }],
        }
      }

      throw new Error(`Unexpected url: ${url}`)
    })

    const response = await fetchTrends(['react'], 'last-year', mockFetch)
    const pkg = response.packages[0]

    expect(pkg.name).toBe('react')
    expect(pkg.stars.length).toBeGreaterThan(0)
    expect(pkg.current.stars).toBe(500)
    expect(pkg.warnings).toEqual([])
  })

  it('serves subsequent requests from client cache without network calls', async () => {
    const serverSeries: TrendsPackageSeries = {
      name: 'vue',
      repository: 'vuejs/core',
      downloads: [{ date: '2026-09-14', value: 100 }],
      stars: [{ date: '2026-09-14', value: 200 }],
      size: [],
      releases: [],
      current: {
        weeklyDownloads: 100,
        stars: 200,
        size: null,
        gzip: null,
      },
      warnings: [],
    }

    const apiGetSpy = jest.spyOn(API, 'get').mockResolvedValueOnce({
      packages: [serverSeries],
      range: 'last-year',
      generatedAt: new Date().toISOString(),
    })

    const first = await fetchTrends(['vue'], 'last-year')
    expect(first.packages[0].name).toBe('vue')
    expect(apiGetSpy).toHaveBeenCalledTimes(1)

    // Second call for same package and range should hit cache
    const second = await fetchTrends(['vue'], 'last-year')
    expect(second.packages[0].name).toBe('vue')
    expect(apiGetSpy).toHaveBeenCalledTimes(1)
  })
})
