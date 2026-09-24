import {
  buildGithubStarTotals,
  getNpmTrendsRange,
  getTrendsRangeStart,
} from '../server/services/trends.service'
import { splitNpmDateRange } from '../server/clients/npm-downloads.client'
import type { TrendsPackageSeries } from '@bundlephobia/service-contracts/trends'
import { groupTrendsPackage, rollupTrendsPoints } from '../utils/trends'

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
      { date: '2026-09-14', value: 95 },
      { date: '2026-09-15', value: 100 },
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

  it('uses UTC calendar dates near a host-timezone boundary', () => {
    expect(
      getTrendsRangeStart('last-2-months', new Date('2024-03-01T00:30:00Z')),
    ).toBe('2024-01-01')
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
    expect(groupTrendsPackage(rawSeries(), 'week')).toMatchObject({
      downloads: [{ date: '2026-09-14', value: 5 }],
      stars: [{ date: '2026-09-14', value: 100 }],
      size: [{ date: '2026-09-14', value: 12, version: '1.1.0' }],
    })
  })

  it.each([
    [
      'day',
      [
        { date: '2026-09-14', value: 95 },
        { date: '2026-09-15', value: 100 },
      ],
    ],
    ['week', [{ date: '2026-09-14', value: 100 }]],
    ['month', [{ date: '2026-09-01', value: 100 }]],
  ] as const)('keeps star totals when grouping by %s', (groupBy, expected) => {
    expect(groupTrendsPackage(rawSeries(), groupBy).stars).toMatchObject(
      expected,
    )
  })

  it('selects the latest total from an unordered bucket', () => {
    expect(
      rollupTrendsPoints(
        [
          { date: '2026-09-15', value: 100 },
          { date: '2026-09-14', value: 95 },
        ],
        'week',
        { mode: 'last', now },
      ),
    ).toMatchObject([{ date: '2026-09-14', value: 100 }])
  })

  it('converts GitHub daily gains into end-of-day repository totals', () => {
    const week = Date.parse('2026-09-13T00:00:00Z') / 1000

    expect(
      buildGithubStarTotals(
        [{ week, total: 10, days: [2, 3, 0, 0, 1, 4, 0] }],
        100,
        {
          from: '2026-09-13',
          now: new Date('2026-09-19T12:00:00Z'),
        },
      ),
    ).toEqual([
      { date: '2026-09-13', value: 92, partial: false },
      { date: '2026-09-14', value: 95, partial: false },
      { date: '2026-09-15', value: 95, partial: false },
      { date: '2026-09-16', value: 95, partial: false },
      { date: '2026-09-17', value: 96, partial: false },
      { date: '2026-09-18', value: 100, partial: false },
      { date: '2026-09-19', value: 100, partial: true },
    ])
  })

  it('normalizes non-UTC GitHub week boundaries to Sunday', () => {
    const saturdayUtcBoundary = Date.parse('2026-09-12T10:00:00Z') / 1000

    expect(
      buildGithubStarTotals(
        [
          {
            week: saturdayUtcBoundary,
            total: 2,
            days: [2, 0, 0, 0, 0, 0, 0],
          },
        ],
        2,
        {
          from: '2026-09-12',
          now: new Date('2026-09-13T12:00:00Z'),
        },
      ),
    ).toEqual([{ date: '2026-09-13', value: 2, partial: true }])
  })

  it('uses the authoritative current count when history lags behind today', () => {
    const week = Date.parse('2026-09-06T00:00:00Z') / 1000

    expect(
      buildGithubStarTotals(
        [{ week, total: 2, days: [2, 0, 0, 0, 0, 0, 0] }],
        10,
        {
          from: '2026-09-12',
          now: new Date('2026-09-15T12:00:00Z'),
        },
      ),
    ).toEqual([
      { date: '2026-09-12', value: 10, partial: false },
      { date: '2026-09-15', value: 10, partial: true },
    ])
  })
})

describe('npm downloads ranges', () => {
  it('splits long ranges into contiguous bounded requests', () => {
    expect(splitNpmDateRange('2023-09-21:2026-09-21')).toEqual([
      '2023-09-21:2024-09-19',
      '2024-09-20:2025-09-19',
      '2025-09-20:2026-09-19',
      '2026-09-20:2026-09-21',
    ])
  })

  it('leaves npm aliases and short ranges unchanged', () => {
    expect(splitNpmDateRange('last-year')).toEqual(['last-year'])
    expect(splitNpmDateRange('2025-01-01:2025-01-31')).toEqual([
      '2025-01-01:2025-01-31',
    ])
  })
})
