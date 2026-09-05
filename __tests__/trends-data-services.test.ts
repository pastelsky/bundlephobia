jest.mock('../server/clients/npmDownloads', () => ({
  fetchNpmDownloadRange: jest.fn(),
}))
jest.mock('../server/trends/cache', () => ({
  getOrLoadTrendsData: (
    _cacheName: string,
    _cacheKey: string,
    _ttl: number,
    load: () => Promise<unknown>,
  ) => load(),
}))

import { fetchNpmDownloadRange } from '../server/clients/npmDownloads'
import {
  getTrendsRangeStart,
  isTrendsGroupBy,
  isTrendsRange,
  rollupPoints,
} from '../server/trends/range'
import { fetchDownloadSeries } from '../server/trends/services/downloads'

const mockFetchNpmDownloadRange = jest.mocked(fetchNpmDownloadRange)

describe('trends data services', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00Z'))
    mockFetchNpmDownloadRange.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('loads and maps a regular npm download range once', async () => {
    mockFetchNpmDownloadRange.mockResolvedValue([
      { day: '2026-08-09', downloads: 4 },
      { day: '2026-08-10', downloads: 6 },
    ])

    await expect(
      fetchDownloadSeries('@babel/core', 'last-year'),
    ).resolves.toEqual({
      points: [
        { date: '2026-08-09', value: 4, partial: false },
        { date: '2026-08-10', value: 6, partial: true },
      ],
      weeklyDownloads: 10,
    })
    expect(mockFetchNpmDownloadRange).toHaveBeenCalledTimes(1)
    expect(mockFetchNpmDownloadRange).toHaveBeenCalledWith(
      '@babel/core',
      'last-year',
    )
  })

  it('reuses three-year history to derive the weekly total', async () => {
    mockFetchNpmDownloadRange.mockImplementation(
      async (_packageName, range) => {
        const end = range.split(':')[1]
        return [{ day: end, downloads: 1 }]
      },
    )

    const result = await fetchDownloadSeries('react', 'last-3-years')
    const requestedRanges = mockFetchNpmDownloadRange.mock.calls.map(
      ([, range]) => range,
    )

    expect(requestedRanges.length).toBeGreaterThan(1)
    expect(requestedRanges).not.toContain('last-month')
    expect(requestedRanges.every(range => range.includes(':'))).toBe(true)
    expect(result.weeklyDownloads).toBe(result.points.length)
  })

  it('validates the public range and grouping values', () => {
    expect(isTrendsRange('last-3-years')).toBe(true)
    expect(isTrendsRange('last-5-years')).toBe(false)
    expect(isTrendsGroupBy('month')).toBe(true)
    expect(isTrendsGroupBy('quarter')).toBe(false)
  })

  it('calculates range starts from the current UTC date', () => {
    expect(getTrendsRangeStart('last-2-months')).toBe('2026-06-10')
    expect(getTrendsRangeStart('last-year')).toBe('2025-08-10')
    expect(getTrendsRangeStart('last-3-years')).toBe('2023-08-10')
  })

  it('rolls daily values into Monday-based weekly buckets', () => {
    expect(
      rollupPoints(
        [
          { date: '2026-08-09', value: 2 },
          { date: '2026-08-10', value: 3, partial: true },
        ],
        'week',
        'sum',
      ),
    ).toEqual([
      { date: '2026-08-03', value: 2, partial: false },
      { date: '2026-08-10', value: 3, partial: true },
    ])
  })
})
