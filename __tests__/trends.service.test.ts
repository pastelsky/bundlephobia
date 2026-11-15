import type { TrendsPackageSeries } from '@bundlephobia/service-contracts/trends'

import { splitNpmDateRange } from '../server/clients/npm-downloads.client'
import {
  buildGithubStarTotals,
  buildVulnerabilityPoints,
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
  vulnerabilities: [
    { date: '2026-09-14', value: 1 },
    { date: '2026-09-15', value: 2 },
  ],
  releases: [],
  current: {
    weeklyDownloads: 5,
    stars: 100,
    size: 20,
    gzip: 12,
    vulnerabilities: {
      total: 2,
      active: 1,
      critical: 0,
      high: 1,
      moderate: 1,
      low: 0,
    },
  },
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

  it('sums downloads but keeps the latest star total, size release, and peak active vulns', () => {
    expect(groupTrendsPackage(series, 'week')).toMatchObject({
      downloads: [{ date: '2026-09-14', value: 5 }],
      stars: [{ date: '2026-09-14', value: 100 }],
      size: [{ date: '2026-09-14', value: 12, version: '1.1.0' }],
      vulnerabilities: [{ date: '2026-09-14', value: 2 }],
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

  it('builds active vulnerability timeline with peaks, fixes, and severity summaries', () => {
    const vulns = [
      {
        id: 'GHSA-1',
        published: '2024-05-10T12:00:00Z',
        database_specific: { severity: 'HIGH' },
        affected: [
          {
            package: { name: 'example-pkg' },
            ranges: [
              {
                events: [{ introduced: '1.0.0' }, { fixed: '1.0.1' }],
              },
            ],
          },
        ],
      },
      {
        id: 'GHSA-2',
        published: '2024-05-15T08:00:00Z',
        database_specific: { severity: 'CRITICAL' },
        affected: [
          {
            package: { name: 'example-pkg' },
            ranges: [
              {
                events: [{ introduced: '1.0.0' }], // Never fixed
              },
            ],
          },
        ],
      },
    ]

    const publishDates = {
      '1.0.1': '2024-05-20',
    }

    const result = buildVulnerabilityPoints(vulns, '2024-05-01', {
      packageName: 'example-pkg',
      publishDates,
    })

    expect(result.summary).toEqual({
      total: 2,
      active: 1, // GHSA-2 is never fixed, so 1 active today
      critical: 1,
      high: 1,
      moderate: 0,
      low: 0,
    })

    // Before any disclosures: 0 active
    const before = result.points.find(p => p.date === '2024-05-05')
    expect(before?.value).toBe(0)

    // After GHSA-1 disclosed, before GHSA-2: 1 active
    const singleActive = result.points.find(p => p.date === '2024-05-12')
    expect(singleActive?.value).toBe(1)

    // Overlap window: both GHSA-1 and GHSA-2 are open (peak = 2)
    const peak = result.points.find(p => p.date === '2024-05-16')
    expect(peak?.value).toBe(2)

    // After 1.0.1 published (2024-05-20), GHSA-1 resolved; GHSA-2 remains open: 1 active
    const postFix = result.points.find(p => p.date === '2024-05-25')
    expect(postFix?.value).toBe(1)

    // Extends to today at current active count (1)
    expect(result.points[result.points.length - 1].value).toBe(1)
  })

  it('creates a zero-baseline timeline when package has 0 vulnerabilities', () => {
    const result = buildVulnerabilityPoints([], '2024-01-01')

    expect(result.summary.total).toBe(0)
    expect(result.summary.active).toBe(0)
    expect(result.points[0]).toEqual({ date: '2024-01-01', value: 0 })
    expect(result.points[result.points.length - 1].value).toBe(0)
  })
})
