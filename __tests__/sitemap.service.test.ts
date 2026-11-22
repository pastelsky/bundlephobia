import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildSitemapXml,
  createSitemapService,
  selectDynamicSitemapPackages,
} from '../server/services/sitemap.service'

const DAY_MS = 24 * 60 * 60 * 1000

const NOW = Date.UTC(2026, 10, 22)

describe('sitemap.service', () => {
  describe('selectDynamicSitemapPackages', () => {
    it('ranks recently active packages above older packages with higher raw counts', () => {
      const records = {
        'older-popular': {
          name: 'older-popular',
          count: 100,
          lastSearched: NOW - 150 * DAY_MS,
        },
        'recent-rising': {
          name: 'recent-rising',
          count: 50,
          lastSearched: NOW - 2 * DAY_MS,
        },
      }

      expect(selectDynamicSitemapPackages(records, NOW)).toEqual([
        'recent-rising',
        'older-popular',
      ])
    })

    it('drops packages older than 6 months and low-count noise', () => {
      const records = {
        'older-than-6m': {
          name: 'older-than-6m',
          count: 5000,
          lastSearched: NOW - 200 * DAY_MS,
        },
        'one-off-recent': {
          name: 'one-off-recent',
          count: 3,
          lastSearched: NOW - 1 * DAY_MS,
        },
        'valid-recent': {
          name: 'valid-recent',
          count: 12,
          lastSearched: NOW - 5 * DAY_MS,
        },
      }

      expect(selectDynamicSitemapPackages(records, NOW)).toEqual([
        'valid-recent',
      ])
    })

    it('excludes versioned, malformed, and blocklisted package names', () => {
      const records = {
        'react@18.2.0': {
          name: 'react@18.2.0',
          count: 200,
          lastSearched: NOW - DAY_MS,
        },
        'bad?query': {
          name: 'bad?query',
          count: 200,
          lastSearched: NOW - DAY_MS,
        },
        '@scope/valid-pkg': {
          name: '@scope/valid-pkg',
          count: 80,
          lastSearched: NOW - DAY_MS,
        },
      }

      expect(selectDynamicSitemapPackages(records, NOW)).toEqual([
        '@scope/valid-pkg',
      ])
    })
  })

  describe('buildSitemapXml & disk-cached createSitemapService', () => {
    it('unions core pages, curated similar packages, trends comparisons, and dynamic packages', async () => {
      const xml = await buildSitemapXml(['valibot', 'hono'])

      expect(xml).toContain('<loc>https://bundlephobia.com/</loc>')
      expect(xml).toContain('<loc>https://bundlephobia.com/scan</loc>')
      expect(xml).toContain('<loc>https://bundlephobia.com/trends</loc>')
      expect(xml).toContain(
        '<loc>https://bundlephobia.com/package/valibot</loc>',
      )
      expect(xml).toContain('<loc>https://bundlephobia.com/package/hono</loc>')
      expect(xml).toContain('<loc>https://bundlephobia.com/package/react</loc>')
      expect(xml).toContain('<loc>https://bundlephobia.com/trends?packages=')
    })

    it('persists generated XML to disk so a fresh service instance reuses it across restarts', async () => {
      const tmpDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'bp-sitemap-test-'),
      )

      const cachePath = path.join(tmpDir, 'sitemap.xml')

      const getRecentSearches = jest.fn().mockResolvedValue({
        valibot: {
          name: 'valibot',
          count: 45,
          lastSearched: Date.now() - DAY_MS,
        },
      })

      try {
        const firstService = createSitemapService(
          { getRecentSearches },
          cachePath,
        )

        const firstXml = await firstService.getSitemapXml()

        const restartedService = createSitemapService(
          { getRecentSearches },
          cachePath,
        )

        const secondXml = await restartedService.getSitemapXml()

        expect(firstXml).toContain(
          '<loc>https://bundlephobia.com/package/valibot</loc>',
        )
        expect(secondXml).toBe(firstXml)
        expect(getRecentSearches).toHaveBeenCalledTimes(1)
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true })
      }
    })
  })
})
