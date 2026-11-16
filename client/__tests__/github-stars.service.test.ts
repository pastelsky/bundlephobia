import API from '../api'
import { clearGithubStarsCache } from '../github-stars.service'
import type { TrendsResponse } from '@bundlephobia/service-contracts/trends'

describe('client GitHub stars resolution', () => {
  beforeEach(() => {
    clearGithubStarsCache()
    jest.restoreAllMocks()
  })

  it('enriches packages with GitHub star count and history', async () => {
    const serverTrendsResponse: TrendsResponse = {
      packages: [
        {
          name: 'react',
          repository: 'facebook/react',
          downloads: [{ date: '2026-09-14', value: 100 }],
          stars: [],
          size: [],
          releases: [],
          current: {
            weeklyDownloads: 100,
            stars: null,
            size: 10,
            gzip: 5,
          },
          warnings: [],
        },
      ],
      range: 'last-year',
      generatedAt: new Date().toISOString(),
    }

    jest.spyOn(API, 'get').mockResolvedValue(serverTrendsResponse)

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

    const response = await API.getTrends(['react'], 'last-year', mockFetch)
    const pkg = response.packages[0]

    expect(pkg.stars.length).toBeGreaterThan(0)
    expect(pkg.current.stars).toBe(500)
    expect(pkg.warnings).toEqual([])
  })

  it('caches GitHub stars to prevent duplicate requests across calls', async () => {
    const serverTrendsResponse: TrendsResponse = {
      packages: [
        {
          name: 'vue',
          repository: 'vuejs/core',
          downloads: [{ date: '2026-09-14', value: 200 }],
          stars: [],
          size: [],
          releases: [],
          current: {
            weeklyDownloads: 200,
            stars: null,
            size: null,
            gzip: null,
          },
          warnings: [],
        },
      ],
      range: 'last-year',
      generatedAt: new Date().toISOString(),
    }

    jest.spyOn(API, 'get').mockResolvedValue(serverTrendsResponse)

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/stargazers/count')) {
        return {
          ok: true,
          json: async () => ({ count: 300 }),
        }
      }

      if (url.includes('/stargazers/history')) {
        const week = Date.parse('2026-09-13T00:00:00Z') / 1000

        return {
          ok: true,
          headers: new Headers(),
          json: async () => [{ week, total: 2, days: [1, 0, 0, 0, 1, 0, 0] }],
        }
      }

      throw new Error(`Unexpected url: ${url}`)
    })

    await API.getTrends(['vue'], 'last-year', mockFetch)
    expect(mockFetch).toHaveBeenCalledTimes(2) // count + history

    // Second call should reuse cached star data
    await API.getTrends(['vue'], 'last-year', mockFetch)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('gracefully handles GitHub errors with warnings', async () => {
    const serverTrendsResponse: TrendsResponse = {
      packages: [
        {
          name: 'broken-repo',
          repository: 'nonexistent/repo',
          downloads: [{ date: '2026-09-14', value: 10 }],
          stars: [],
          size: [],
          releases: [],
          current: {
            weeklyDownloads: 10,
            stars: null,
            size: null,
            gzip: null,
          },
          warnings: [],
        },
      ],
      range: 'last-year',
      generatedAt: new Date().toISOString(),
    }

    jest.spyOn(API, 'get').mockResolvedValue(serverTrendsResponse)

    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'))

    const response = await API.getTrends(
      ['broken-repo'],
      'last-year',
      mockFetch,
    )

    const pkg = response.packages[0]

    expect(pkg.stars).toEqual([])
    expect(pkg.current.stars).toBeNull()
    expect(pkg.warnings).toContain('GitHub star history is unavailable')
  })
})
