import { parsePackagesQuery } from '../server/trends/buildTrends'
import {
  isTrendsGroupBy,
  isTrendsRange,
  rollupPoints,
} from '../server/trends/range'
import { resolveGithubRepo } from '../server/trends/resolveGithubRepo'

describe('trends server utilities', () => {
  describe('parsePackagesQuery', () => {
    it('parses single string comma separated packages', () => {
      expect(parsePackagesQuery('react, vue, svelte')).toEqual([
        'react',
        'vue',
        'svelte',
      ])
    })

    it('parses array of strings', () => {
      expect(parsePackagesQuery(['react', 'vue'])).toEqual(['react', 'vue'])
    })

    it('filters out empty values', () => {
      expect(parsePackagesQuery('react,, vue  , ')).toEqual(['react', 'vue'])
    })

    it('returns empty array when undefined', () => {
      expect(parsePackagesQuery(undefined)).toEqual([])
    })
  })

  describe('isTrendsRange', () => {
    it('validates supported ranges', () => {
      expect(isTrendsRange('last-2-months')).toBe(true)
      expect(isTrendsRange('last-year')).toBe(true)
      expect(isTrendsRange('last-3-years')).toBe(true)
      expect(isTrendsRange('last-5-years')).toBe(false)
    })

    it('rejects invalid range strings', () => {
      expect(isTrendsRange('invalid-range')).toBe(false)
      expect(isTrendsRange(undefined)).toBe(false)
    })
  })

  describe('grouping', () => {
    it('validates the canonical grouping options', () => {
      expect(isTrendsGroupBy('day')).toBe(true)
      expect(isTrendsGroupBy('week')).toBe(true)
      expect(isTrendsGroupBy('month')).toBe(true)
      expect(isTrendsGroupBy('quarter')).toBe(false)
    })

    it('rolls summed points into weekly buckets', () => {
      expect(
        rollupPoints(
          [
            { date: '2025-01-06', value: 2 },
            { date: '2025-01-07', value: 3, partial: true },
          ],
          'week',
          'sum'
        )
      ).toEqual([{ date: '2025-01-06', value: 5, partial: true }])
    })
  })

  describe('resolveGithubRepo', () => {
    it('resolves repository for react package', async () => {
      const repo = await resolveGithubRepo('react')
      expect(repo).toBe('facebook/react')
    })

    it('resolves repository for vue package', async () => {
      const repo = await resolveGithubRepo('vue')
      expect(repo).toBe('vuejs/core')
    })

    it('resolves repository for express package', async () => {
      const repo = await resolveGithubRepo('express')
      expect(repo).toBe('expressjs/express')
    })
  })
})
