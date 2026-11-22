import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { SitemapStream, streamToPromise } from 'sitemap'

import {
  trendsComparisonPath,
  trendsComparisons,
} from '../../seo/trends-comparisons'
import { parsePackageString } from '../../utils/common.utils'
import type { SearchRecord } from '../../utils/firebase.utils'
import { categories, comparisonGroups } from '../../utils/similarPackages'
import config from '../config'

const DAY_MS = 24 * 60 * 60 * 1000

const SITEMAP_POLICY = {
  cacheTtlMs: DAY_MS,
  maxAgeMs: 180 * DAY_MS,
  decayHalfLifeDays: 90,
  minSearchCount: 10,
  maxDynamicPackages: 2000,
  recentSearchLimit: 2000,
} as const

const DEFAULT_CACHE_PATH = path.join(os.tmpdir(), 'bundlephobia-sitemap.xml')

const CORE_PAGES = ['', '/scan', '/trends'] as const

const CURATED_PACKAGES = new Set<string>([
  ...Object.values(categories).flatMap(category => category.similar),
  ...comparisonGroups.flatMap(group => group.packages),
])

const UNSUPPORTED_PATTERNS = config.unsupported.map(
  rule => new RegExp(rule.test),
)

export interface SitemapSearchAdapter {
  getRecentSearches(limit: number): Promise<Record<string, SearchRecord>>
}

function isEligiblePackageName(rawName: string): boolean {
  const trimmed = rawName.trim()

  if (!trimmed || /\s|[?#%]/.test(trimmed)) return false

  const parsed = parsePackageString(trimmed)

  if (!parsed.name || parsed.version || parsed.name !== trimmed) return false

  if (config.blackList.some(pattern => pattern.test(parsed.name))) return false

  if (UNSUPPORTED_PATTERNS.some(pattern => pattern.test(parsed.name))) {
    return false
  }

  return true
}

function scoreSearchRecord(record: SearchRecord, now: number): number | null {
  if (!record || !Number.isFinite(record.count)) return null

  if (record.count < SITEMAP_POLICY.minSearchCount) return null

  const lastSearched = Number.isFinite(record.lastSearched)
    ? record.lastSearched
    : 0

  const ageMs = Math.max(0, now - lastSearched)

  if (ageMs > SITEMAP_POLICY.maxAgeMs) return null

  const ageDays = ageMs / DAY_MS

  return record.count / (1 + ageDays / SITEMAP_POLICY.decayHalfLifeDays)
}

export function selectDynamicSitemapPackages(
  records: Record<string, SearchRecord>,
  now = Date.now(),
  maxPackages: number = SITEMAP_POLICY.maxDynamicPackages,
): string[] {
  const scored: Array<{ name: string; score: number }> = []

  for (const [key, record] of Object.entries(records)) {
    const name = record?.name || key

    if (!isEligiblePackageName(name)) continue

    const score = scoreSearchRecord(record, now)

    if (score !== null) {
      scored.push({ name, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPackages)
    .map(entry => entry.name)
}

export async function buildSitemapXml(
  dynamicPackages: readonly string[],
): Promise<string> {
  const packageNames = new Set<string>([
    ...CURATED_PACKAGES,
    ...dynamicPackages,
  ])

  const links = [
    ...CORE_PAGES.map(page => ({
      url: page,
      changefreq: 'weekly' as const,
      priority: 1,
    })),
    ...[...packageNames].map(packageName => ({
      url: `/package/${packageName}`,
      changefreq: 'weekly' as const,
      priority: 0.7,
    })),
    ...trendsComparisons.map(packages => ({
      url: trendsComparisonPath(packages),
      changefreq: 'weekly' as const,
      priority: 0.7,
    })),
  ]

  const stream = new SitemapStream({ hostname: 'https://bundlephobia.com' })
  const buffer = await streamToPromise(Readable.from(links).pipe(stream))

  return buffer.toString('utf8')
}

async function readFreshDiskCache(
  cacheFilePath: string,
  now: number,
): Promise<string | null> {
  try {
    const stat = await fs.stat(cacheFilePath)

    if (now - stat.mtimeMs < SITEMAP_POLICY.cacheTtlMs) {
      return await fs.readFile(cacheFilePath, 'utf8')
    }
  } catch {
    // Cache miss or unreadable file; caller will regenerate.
  }

  return null
}

async function writeDiskCache(
  cacheFilePath: string,
  xml: string,
): Promise<void> {
  const tmpPath = `${cacheFilePath}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true })
  await fs.writeFile(tmpPath, xml, 'utf8')
  await fs.rename(tmpPath, cacheFilePath)
}

export function createSitemapService(
  searchAdapter: SitemapSearchAdapter,
  cacheFilePath = DEFAULT_CACHE_PATH,
) {
  let inflight: Promise<string> | null = null

  async function refresh(now: number): Promise<string> {
    const records = await searchAdapter.getRecentSearches(
      SITEMAP_POLICY.recentSearchLimit,
    )

    const packages = selectDynamicSitemapPackages(records, now)
    const xml = await buildSitemapXml(packages)

    await writeDiskCache(cacheFilePath, xml).catch(() => undefined)

    return xml
  }

  return {
    async getSitemapXml(now = Date.now()): Promise<string> {
      const cached = await readFreshDiskCache(cacheFilePath, now)

      if (cached) return cached

      if (!inflight) {
        inflight = refresh(now).finally(() => {
          inflight = null
        })
      }

      return inflight
    },
  }
}
