import type { TrendsPackageSeries } from '@bundlephobia/service-contracts/trends'

import { splitNpmDateRange } from '../server/clients/npm-downloads.client'
import {
  buildGithubStarTotals,
  getTrendsRangeStart,
} from '../server/services/trends.service'
import { groupTrendsPackage } from '../utils/trends'

const series: TrendsPackageSeries = {
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
  current: { weeklyDownloads: 5, stars: 100, size: 20, gzip: 12 },
  warnings: [],
}

describe('trends data', () => {
  it('uses UTC calendar dates and clamps month/year ranges', () => {
    expect(
      getTrendsRangeStart('last-2-months', new Date('2024-03-01T00:30:00Z')),
    ).toBe('2024-01-01')
    expect(
      getTrendsRangeStart('last-2-months', new Date('2024-03-31T12:00:00Z')),
    ).toBe('2024-01-31')
    expect(
      getTrendsRangeStart('last-year', new Date('2024-02-29T12:00:00Z')),
    ).toBe('2023-02-28')
  })

  it('sums downloads but keeps the latest star total and size release', () => {
    expect(groupTrendsPackage(series, 'week')).toMatchObject({
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
  ] as const)('preserves star totals with %s grouping', (groupBy, expected) => {
    expect(groupTrendsPackage(series, groupBy).stars).toMatchObject(expected)
  })

  it('turns GitHub daily gains into repository totals', () => {
    const week = Date.parse('2026-09-13T00:00:00Z') / 1000

    expect(
      buildGithubStarTotals(
        [{ week, total: 10, days: [2, 3, 0, 0, 1, 4, 0] }],
        100,
        { from: '2026-09-13', now: new Date('2026-09-19T12:00:00Z') },
      ).map(point => [point.date, point.value]),
    ).toEqual([
      ['2026-09-13', 92],
      ['2026-09-14', 95],
      ['2026-09-15', 95],
      ['2026-09-16', 95],
      ['2026-09-17', 96],
      ['2026-09-18', 100],
      ['2026-09-19', 100],
    ])
  })

  it('uses the current star count when history stops before today', () => {
    const week = Date.parse('2026-09-06T00:00:00Z') / 1000

    expect(
      buildGithubStarTotals(
        [{ week, total: 2, days: [2, 0, 0, 0, 0, 0, 0] }],
        10,
        { from: '2026-09-12', now: new Date('2026-09-15T12:00:00Z') },
      ).map(point => [point.date, point.value]),
    ).toEqual([
      ['2026-09-12', 10],
      ['2026-09-15', 10],
    ])
  })

  it('splits three years of npm history into contiguous bounded requests', () => {
    expect(splitNpmDateRange('2023-09-21:2026-09-21')).toEqual([
      '2023-09-21:2024-09-19',
      '2024-09-20:2025-09-19',
      '2025-09-20:2026-09-19',
      '2026-09-20:2026-09-21',
    ])
  })
})
