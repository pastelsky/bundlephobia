import API from '../api'
import {
  clearClientTrendsCache,
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

  it('stores and expires cached series based on degraded status', () => {
    const completeSeries: TrendsPackageSeries = {
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

    const degradedSeries: TrendsPackageSeries = {
      ...completeSeries,
      warnings: ['GitHub star history is unavailable'],
    }

    setCachedTrendsSeries('react', 'last-year', completeSeries, 1000)
    setCachedTrendsSeries('vue', 'last-year', degradedSeries, 1000)

    // Complete series is cached for 10 minutes
    expect(getCachedTrendsSeries('react', 'last-year', 1500)).toEqual(
      completeSeries,
    )
    expect(
      getCachedTrendsSeries('react', 'last-year', 1000 + 600_001),
    ).toBeNull()

    // Degraded series with warnings expires after 30 seconds
    expect(getCachedTrendsSeries('vue', 'last-year', 1000 + 30_001)).toBeNull()
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
