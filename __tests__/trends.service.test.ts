import {
  getTrendsRangeStart,
  rollupTrendsPoints,
} from '../server/services/trends.service'

describe('trends service primitives', () => {
  it('calculates a deterministic range start', () => {
    expect(
      getTrendsRangeStart('last-year', new Date('2026-09-20T00:00:00Z')),
    ).toBe('2025-09-20')
  })

  it('rolls daily values into Monday weeks', () => {
    expect(
      rollupTrendsPoints(
        [
          { date: '2025-01-06', value: 2 },
          { date: '2025-01-07', value: 3, partial: true },
        ],
        'week',
        'sum',
      ),
    ).toEqual([
      { date: '2025-01-06', value: 5, partial: true, version: undefined },
    ])
  })
})
