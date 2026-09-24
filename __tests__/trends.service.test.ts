import {
  getNpmTrendsRange,
  getTrendsRangeStart,
  groupPackageTrends,
  rollupTrendsPoints,
} from '../server/services/trends.service'
import type { TrendsPackageSeries } from '@bundlephobia/service-contracts/trends'

const now = new Date('2026-09-20T12:00:00Z')

function rawSeries(): TrendsPackageSeries {
  return {
    name: 'react',
    repository: 'facebook/react',
    downloads: [
      { date: '2026-09-14', value: 2 },
      { date: '2026-09-15', value: 3 },
    ],
    stars: [
      { date: '2026-09-14', value: 5 },
      { date: '2026-09-15', value: 7 },
    ],
    size: [
      { date: '2026-09-14', value: 10, version: '1.0.0' },
      { date: '2026-09-15', value: 12, version: '1.1.0' },
    ],
    releases: [],
    current: {
      weeklyDownloads: 5,
      stars: 100,
      size: 20,
      gzip: 12,
    },
    warnings: [],
  }
}

describe('trends service primitives', () => {
  it.each([
    ['last-2-months', '2026-07-20'],
    ['last-year', '2025-09-20'],
    ['last-3-years', '2023-09-20'],
  ] as const)('calculates the %s range start', (range, expected) => {
    expect(getTrendsRangeStart(range, now)).toBe(expected)
  })

  it('uses explicit date boundaries for each npm range', () => {
    expect(getNpmTrendsRange('last-2-months', now)).toBe(
      '2026-07-20:2026-09-20',
    )
    expect(getNpmTrendsRange('last-year', now)).toBe('2025-09-20:2026-09-20')
    expect(getNpmTrendsRange('last-3-years', now)).toBe('2023-09-20:2026-09-20')
  })

  it('clamps ranges at calendar boundaries', () => {
    expect(
      getTrendsRangeStart('last-2-months', new Date('2024-03-31T12:00:00Z')),
    ).toBe('2024-01-31')
    expect(
      getTrendsRangeStart('last-year', new Date('2024-02-29T12:00:00Z')),
    ).toBe('2023-02-28')
  })

  it('rolls daily values into Monday weeks', () => {
    expect(
      rollupTrendsPoints(
        [
          { date: '2025-01-06', value: 2 },
          { date: '2025-01-07', value: 3, partial: true },
        ],
        'week',
        { mode: 'sum', now: new Date('2025-01-07T00:00:00Z') },
      ),
    ).toEqual([
      { date: '2025-01-06', value: 5, partial: true, version: undefined },
    ])
  })

  it('marks the current summed bucket partial without marking size events', () => {
    expect(
      rollupTrendsPoints([{ date: '2026-09-19', value: 2 }], 'month', {
        mode: 'sum',
        now,
      }),
    ).toEqual([
      { date: '2026-09-01', value: 2, partial: true, version: undefined },
    ])

    expect(
      rollupTrendsPoints(
        [{ date: '2026-09-19', value: 2, version: '1.0.0' }],
        'month',
        { mode: 'last', now },
      ),
    ).toEqual([
      { date: '2026-09-01', value: 2, partial: false, version: '1.0.0' },
    ])
  })

  it('uses the same grouping boundary for every metric', () => {
    expect(groupPackageTrends(rawSeries(), 'week')).toMatchObject({
      downloads: [{ date: '2026-09-14', value: 5 }],
      stars: [{ date: '2026-09-14', value: 12 }],
      size: [{ date: '2026-09-14', value: 12, version: '1.1.0' }],
    })
  })
})
