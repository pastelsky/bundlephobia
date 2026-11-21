import type { TrendsPackageSeries } from '@bundlephobia/service-contracts/trends'

import {
  buildGithubStarTotals,
  buildVulnerabilityPoints,
  getTrendsRangeStart,
} from '../server/services/trends.service'
import {
  filterPackageVulnerabilities,
  groupTrendsPackage,
  resolveBucketVulnerabilityDetails,
  splitNpmDateRange,
} from '../utils/trends'

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
      moderate: 0,
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

  it('sums downloads but keeps the latest star total, size release, and peak vulns', () => {
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

  it('tracks active OSV semver exposure across releases without fake post-fix spikes', () => {
    const vulns = [
      {
        id: 'GHSA-old-resolved',
        published: '2024-05-18T00:00:00Z',
        database_specific: { severity: 'HIGH' },
        affected: [
          {
            package: { name: 'example-pkg', ecosystem: 'npm' },
            ranges: [{ events: [{ introduced: '0' }, { fixed: '1.0.0' }] }],
          },
        ],
      },
      {
        id: 'GHSA-patched',
        published: '2024-05-25T00:00:00Z',
        database_specific: { severity: 'MODERATE' },
        affected: [
          {
            package: { name: 'example-pkg', ecosystem: 'npm' },
            ranges: [{ events: [{ introduced: '1.0.0' }, { fixed: '1.2.0' }] }],
          },
        ],
      },
      {
        id: 'GHSA-unpatched',
        aliases: ['CVE-2024-9999'],
        summary: 'Critical issue',
        published: '2024-05-15T00:00:00Z',
        database_specific: { severity: 'CRITICAL' },
        affected: [
          {
            package: { name: 'example-pkg', ecosystem: 'npm' },
            ranges: [
              { events: [{ introduced: '1.1.0' }, { last_affected: '1.2.0' }] },
            ],
          },
        ],
      },
      {
        id: 'GHSA-withdrawn',
        withdrawn: '2024-05-16T00:00:00Z',
        database_specific: { severity: 'HIGH' },
        affected: [
          {
            package: { name: 'example-pkg', ecosystem: 'npm' },
            ranges: [{ events: [{ introduced: '0' }] }],
          },
        ],
      },
    ]

    const result = buildVulnerabilityPoints(vulns, '2024-05-01', {
      packageName: 'example-pkg',
      now: new Date('2024-05-30T00:00:00Z'),
      publishDates: {
        '1.0.0': '2024-05-01',
        '1.1.0': '2024-05-10',
        '1.2.0': '2024-05-20',
      },
    })

    const valueOn = (date: string) =>
      result.points.find(point => point.date === date)?.value

    // 1.0.0: GHSA-patched only (GHSA-old-resolved already fixed in 1.0.0)
    expect(valueOn('2024-05-05')).toBe(1)
    // 1.1.0: GHSA-patched + GHSA-unpatched
    expect(valueOn('2024-05-12')).toBe(2)
    // 1.2.0: GHSA-patched resolved; no fake spike on 2024-05-25 published date
    expect(valueOn('2024-05-22')).toBe(1)
    expect(valueOn('2024-05-25')).toBe(1)

    expect(result.summary).toEqual({
      total: 3,
      active: 1,
      critical: 1,
      high: 0,
      moderate: 0,
      low: 0,
    })

    // Only range-overlapping advisories (GHSA-patched + GHSA-unpatched) are included
    expect(result.advisories.map(adv => adv.id)).toEqual([
      'GHSA-patched',
      'GHSA-unpatched',
    ])

    const mockPack: TrendsPackageSeries = {
      ...series,
      vulnerabilities: result.points,
      advisories: result.advisories,
      current: { ...series.current, vulnerabilities: result.summary },
    }

    const criticalOnly = filterPackageVulnerabilities(
      mockPack,
      new Set(['critical']),
    )

    expect(
      criticalOnly.vulnerabilities.find(p => p.date === '2024-05-05')?.value,
    ).toBe(0)
    expect(
      criticalOnly.vulnerabilities.find(p => p.date === '2024-05-12')?.value,
    ).toBe(1)

    const peakDetails = resolveBucketVulnerabilityDetails(mockPack, {
      timestamp: Date.parse('2024-05-14T00:00:00Z'),
      groupBy: 'month',
      enabledSeverities: new Set(['critical', 'high', 'moderate', 'low']),
    })

    expect(peakDetails?.count).toBe(2)
    expect(peakDetails?.bySeverity).toEqual({
      critical: 1,
      high: 0,
      moderate: 1,
      low: 0,
    })
    expect(peakDetails?.advisories.map(adv => adv.cve ?? adv.id)).toEqual([
      'CVE-2024-9999',
      'GHSA-patched',
    ])
  })
})
