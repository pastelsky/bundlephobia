import semver from 'semver'

import type {
  PackageHistoryResponse,
  PackageHistoryVersion,
} from '../../types/package-history'
import type {
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
  TrendsResponse,
  TrendsVulnerabilitySummary,
} from '@bundlephobia/service-contracts/trends'
import {
  buildGithubStarTotals,
  dateForGithubDay,
  startOfTrendsRangeDate,
} from '../../utils/trends'
import {
  fetchGithubStarCount,
  fetchGithubStarHistoryPage,
  type GithubStarHistoryRow,
} from '../clients/github.client'
import {
  fetchPackageVulnerabilities,
  type OsvAffected,
  type OsvRange,
  type OsvRangeEvent,
  type OsvVulnerability,
} from '../clients/osv.client'
import { fetchPackageTrendsHistory } from './package-history.service'

export { buildGithubStarTotals }

const MAX_GITHUB_HISTORY_PAGES = 100

const COMPLETE_CACHE_TTL_MS = 10 * 60 * 1000

const DEGRADED_CACHE_TTL_MS = 30 * 1000

const MAX_CACHED_PACKAGE_RANGES = 250

interface LruCache<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V, maxAge?: number): this
}

interface LruCacheConstructor {
  new <K, V>(options: { max: number; maxAge: number }): LruCache<K, V>
}

// SAFETY: the pinned lru-cache package uses this constructor and set contract.
const LRU = require('lru-cache') as LruCacheConstructor

const packageTrendsCache = new LRU<string, TrendsPackageSeries>({
  max: MAX_CACHED_PACKAGE_RANGES,
  maxAge: COMPLETE_CACHE_TTL_MS,
})

const packageTrendsRequests = new Map<string, Promise<TrendsPackageSeries>>()

export function getTrendsRangeStart(
  range: TrendsRange,
  now = new Date(),
): string {
  return startOfTrendsRangeDate(range, now)
}

function parsePackages(packages: string[]): string[] {
  return [
    ...new Set(
      packages.flatMap(packageName => {
        const trimmed = packageName.trim()

        return trimmed ? trimmed.split(',').map(part => part.trim()) : []
      }),
    ),
  ].filter(Boolean)
}

type GithubHistoryCursor = {
  page: number
  lastPage: number | null
  from: string
}

function shouldStopGithubHistory(
  rows: GithubStarHistoryRow[],
  cursor: GithubHistoryCursor,
): boolean {
  if (rows.length === 0) return true

  const oldestRow = rows.at(-1)
  const oldestDate = oldestRow ? dateForGithubDay(oldestRow.week, 0) : null

  return Boolean(
    (oldestDate !== null && oldestDate <= cursor.from) ||
    (cursor.lastPage !== null && cursor.page >= cursor.lastPage) ||
    (cursor.lastPage === null && rows.length < 30),
  )
}

async function fetchGithubStars(
  repository: string,
  from: string,
): Promise<{ points: TrendsPoint[]; current: number | null }> {
  const rows: GithubStarHistoryRow[] = []
  let page = 1
  let lastPage: number | null = null

  while (page <= MAX_GITHUB_HISTORY_PAGES) {
    const result = await fetchGithubStarHistoryPage(repository, page)
    rows.push(...result.rows)
    lastPage = result.lastPage

    if (shouldStopGithubHistory(result.rows, { page, lastPage, from })) break

    page += 1
  }

  const current = await fetchGithubStarCount(repository)

  return {
    points: buildGithubStarTotals(rows, current, { from }),
    current,
  }
}

function sizePoints(history: PackageHistoryResponse): TrendsPoint[] {
  return history.versions.flatMap(version => {
    if (!version.publishedAt || version.gzip === null) return []

    return [
      {
        date: version.publishedAt,
        value: version.gzip,
        version: version.version,
      },
    ]
  })
}

function latestBuiltVersion(
  versions: PackageHistoryVersion[],
): PackageHistoryVersion | undefined {
  return [...versions]
    .filter(version => version.gzip !== null || version.size !== null)
    .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
    .at(-1)
}

type GithubTrendResult = { points: TrendsPoint[]; current: number | null }

function getSettledGithub(
  result: PromiseSettledResult<GithubTrendResult>,
  warnings: string[],
): GithubTrendResult {
  if (result.status === 'fulfilled') return result.value

  warnings.push('GitHub star history is unavailable')

  return { points: [], current: null }
}

export type VulnerabilityTrendsResult = {
  points: TrendsPoint[]
  summary: TrendsVulnerabilitySummary
}

export type BuildVulnerabilityOptions = {
  packageName?: string
  publishDates?: Record<string, string>
  now?: Date
}

type VersionTransition = {
  since: string
  version: string
}

const SEVERITY_MAP = new Map<
  string,
  keyof Omit<TrendsVulnerabilitySummary, 'total' | 'active'>
>([
  ['CRITICAL', 'critical'],
  ['HIGH', 'high'],
  ['MODERATE', 'moderate'],
  ['MEDIUM', 'moderate'],
  ['LOW', 'low'],
])

function parseEventVersion(raw: string | undefined): string | null {
  if (!raw) return null

  const normalized = raw === '0' ? '0.0.0' : raw

  return semver.valid(normalized)
}

function stepRangeEvent(version: string, active: boolean, ev: OsvRangeEvent) {
  const intro = parseEventVersion(ev.introduced)

  if (intro && semver.gte(version, intro)) return true

  const exclusiveEnd = parseEventVersion(ev.fixed ?? ev.limit)

  if (exclusiveEnd && semver.gte(version, exclusiveEnd)) {
    return false
  }

  const lastAffected = parseEventVersion(ev.last_affected)

  if (lastAffected && semver.gt(version, lastAffected)) {
    return false
  }

  return active
}

function isVersionInOsvRange(version: string, range: OsvRange): boolean {
  if ((range.type ?? 'SEMVER') !== 'SEMVER') return false

  let active = false

  for (const ev of range.events ?? []) {
    active = stepRangeEvent(version, active, ev)
  }

  return active
}

function matchesAffectedPackage(
  aff: OsvAffected,
  packageName?: string,
): boolean {
  const eco = aff.package?.ecosystem

  if (eco && eco.toLowerCase() !== 'npm') return false

  const target = aff.package?.name

  if (
    packageName &&
    target &&
    target.toLowerCase() !== packageName.toLowerCase()
  ) {
    return false
  }

  return true
}

function isVersionAffectedByVulnerability(
  version: string,
  vuln: OsvVulnerability,
  packageName?: string,
): boolean {
  return (vuln.affected ?? []).some(aff => {
    if (!matchesAffectedPackage(aff, packageName)) return false

    if (aff.versions?.includes(version)) return true

    return (aff.ranges ?? []).some(range => isVersionInOsvRange(version, range))
  })
}

function buildLatestVersionTimeline(
  publishDates: Record<string, string>,
): VersionTransition[] {
  const parsedEntries = Object.entries(publishDates).flatMap(
    ([version, date]) => {
      const parsed = semver.parse(version)

      if (!parsed || !date) return []

      return [{ version, date, isPrerelease: parsed.prerelease.length > 0 }]
    },
  )

  const hasStable = parsedEntries.some(entry => !entry.isPrerelease)

  const candidates = (
    hasStable
      ? parsedEntries.filter(entry => !entry.isPrerelease)
      : parsedEntries
  ).sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      semver.compare(left.version, right.version),
  )

  const transitions: VersionTransition[] = []
  let maxVersion: string | null = null

  for (const entry of candidates) {
    if (maxVersion && !semver.gt(entry.version, maxVersion)) {
      continue
    }

    maxVersion = entry.version

    const prev = transitions.at(-1)

    if (prev?.since === entry.date) {
      prev.version = maxVersion
    } else {
      transitions.push({ since: entry.date, version: maxVersion })
    }
  }

  return transitions
}

function summarizeVulnerabilities(
  total: number,
  activeVulns: OsvVulnerability[],
): TrendsVulnerabilitySummary {
  const summary: TrendsVulnerabilitySummary = {
    total,
    active: activeVulns.length,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  }

  for (const vuln of activeVulns) {
    const rawSeverity = (vuln.database_specific?.severity ?? '').toUpperCase()
    const key = SEVERITY_MAP.get(rawSeverity)

    if (key) summary[key] += 1
  }

  return summary
}

function buildDailyActiveTimeline(
  transitions: VersionTransition[],
  activeCountByVersion: Map<string, number>,
  range: { from: string; today: string },
): TrendsPoint[] {
  const points: TrendsPoint[] = []
  const cursor = new Date(`${range.from}T00:00:00Z`)
  const end = new Date(`${range.today}T00:00:00Z`)
  let tIndex = 0

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)

    while (
      tIndex + 1 < transitions.length &&
      transitions[tIndex + 1].since <= date
    ) {
      tIndex += 1
    }

    const activeVersion =
      transitions[tIndex].since <= date ? transitions[tIndex].version : null

    points.push({
      date,
      value: activeVersion ? (activeCountByVersion.get(activeVersion) ?? 0) : 0,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return points
}

function indexActiveVulnsByVersion(
  transitions: VersionTransition[],
  vulns: OsvVulnerability[],
  packageName?: string,
) {
  const byVersion = new Map<string, OsvVulnerability[]>()

  for (const transition of transitions) {
    const matching = vulns.filter(vuln =>
      isVersionAffectedByVulnerability(transition.version, vuln, packageName),
    )

    byVersion.set(transition.version, matching)
  }

  return byVersion
}

function emptyVulnerabilityTimeline(
  total: number,
  from: string,
  todayStr: string,
): VulnerabilityTrendsResult {
  return {
    points: [
      { date: from, value: 0 },
      { date: todayStr, value: 0 },
    ],
    summary: summarizeVulnerabilities(total, []),
  }
}

export function buildVulnerabilityPoints(
  vulns: OsvVulnerability[],
  from: string,
  options: BuildVulnerabilityOptions = {},
): VulnerabilityTrendsResult {
  const activeVulns = vulns.filter(vuln => !vuln.withdrawn)
  const todayStr = (options.now ?? new Date()).toISOString().slice(0, 10)
  const transitions = buildLatestVersionTimeline(options.publishDates ?? {})

  if (activeVulns.length === 0 || transitions.length === 0) {
    return emptyVulnerabilityTimeline(activeVulns.length, from, todayStr)
  }

  const activeListByVersion = indexActiveVulnsByVersion(
    transitions,
    activeVulns,
    options.packageName,
  )

  const latestTransition = transitions.at(-1)

  const currentActive = latestTransition
    ? (activeListByVersion.get(latestTransition.version) ?? [])
    : []

  const activeCountByVersion = new Map(
    [...activeListByVersion.entries()].map(([ver, list]) => [ver, list.length]),
  )

  return {
    points: buildDailyActiveTimeline(transitions, activeCountByVersion, {
      from,
      today: todayStr,
    }),
    summary: summarizeVulnerabilities(activeVulns.length, currentActive),
  }
}

type SettledVulnerabilityResult = {
  points: TrendsPoint[]
  summary: TrendsVulnerabilitySummary | null
}

function getSettledVulnerabilities(
  result: PromiseSettledResult<OsvVulnerability[]>,
  warnings: string[],
  options: {
    from: string
    packageName: string
    publishDates: Record<string, string>
  },
): SettledVulnerabilityResult {
  if (result.status !== 'fulfilled') {
    warnings.push('Security vulnerability history is unavailable')

    return { points: [], summary: null }
  }

  const { points, summary } = buildVulnerabilityPoints(
    result.value,
    options.from,
    {
      packageName: options.packageName,
      publishDates: options.publishDates,
    },
  )

  return { points, summary }
}

async function fetchPackageTrendsSource(
  packageName: string,
  range: TrendsRange,
): Promise<TrendsPackageSeries> {
  const from = getTrendsRangeStart(range)

  const { history, publishDates } = await fetchPackageTrendsHistory(
    packageName,
    {
      from,
      limit: 500,
    },
  )

  const warnings: string[] = []

  const [githubResult, vulnsResult] = await Promise.allSettled([
    history.repository
      ? fetchGithubStars(history.repository, from)
      : Promise.resolve({ points: [], current: null }),
    fetchPackageVulnerabilities(packageName),
  ])

  const github = getSettledGithub(githubResult, warnings)

  const vulns = getSettledVulnerabilities(vulnsResult, warnings, {
    from,
    packageName,
    publishDates,
  })

  const size = sizePoints(history)
  const latest = latestBuiltVersion(history.versions)

  // npm downloads are fetched client-side directly from api.npmjs.org to avoid
  // shared server IP rate-limiting (Cloudflare 429 / 1015).
  return {
    name: packageName,
    repository: history.repository,
    downloads: [],
    stars: github.points,
    size,
    vulnerabilities: vulns.points,
    releases: history.releases.map(release => ({
      version: release.version,
      date: release.publishedAt,
      major: release.major,
      minor: release.minor,
    })),
    current: {
      weeklyDownloads: null,
      stars: github.current,
      size: latest?.size ?? null,
      gzip: latest?.gzip ?? null,
      vulnerabilities: vulns.summary,
    },
    warnings,
  }
}

function getPackageTrendsSource(
  packageName: string,
  range: TrendsRange,
): Promise<TrendsPackageSeries> {
  const key = `${packageName}|${range}`
  const cached = packageTrendsCache.get(key)

  if (cached) return Promise.resolve(cached)

  const pending = packageTrendsRequests.get(key)

  if (pending) return pending

  const request = fetchPackageTrendsSource(packageName, range)
    .then(source => {
      const ttl =
        source.warnings.length > 0
          ? DEGRADED_CACHE_TTL_MS
          : COMPLETE_CACHE_TTL_MS

      packageTrendsCache.set(key, source, ttl)

      return source
    })
    .finally(() => packageTrendsRequests.delete(key))

  packageTrendsRequests.set(key, request)

  return request
}

export async function buildTrendsResponse(
  packageNames: string[],
  range: TrendsRange,
): Promise<TrendsResponse> {
  const packages = parsePackages(packageNames)

  const sources = await Promise.all(
    packages.map(packageName => getPackageTrendsSource(packageName, range)),
  )

  return {
    packages: sources,
    range,
    generatedAt: new Date().toISOString(),
  }
}
