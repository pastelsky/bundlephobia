import { parsePackageString } from '../../utils/common.utils'
import { fetchDownloadSeries } from './downloads'
import { fetchGithubTrendSeries } from './githubHistory'
import { fetchPackageReleases } from './releases'
import { resolveGithubRepo } from './resolveGithubRepo'
import { fetchSizeSeries } from './sizeHistory'
import { filterPointsByRange, getTrendsRangeStart, rollupPoints } from './range'
import {
  MAX_TRENDS_PACKAGES,
  type TrendsPackageSeries,
  type TrendsGroupBy,
  type TrendsRange,
  type TrendsResponse,
} from './types'

function uniquePackageNames(rawPackages: string[]) {
  const seen = new Set<string>()
  const names: string[] = []

  for (const raw of rawPackages) {
    const trimmed = raw.trim()
    if (!trimmed) {
      continue
    }
    const { name } = parsePackageString(trimmed)
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    names.push(name)
    if (names.length >= MAX_TRENDS_PACKAGES) {
      break
    }
  }

  return names
}

async function buildPackageSeries(
  packageName: string,
  range: TrendsRange,
  groupBy: TrendsGroupBy
): Promise<TrendsPackageSeries> {
  const warnings: string[] = []
  const repository = await resolveGithubRepo(packageName)

  const [downloadsResult, releasesResult] = await Promise.all([
    fetchDownloadSeries(packageName, range).catch(() => {
      warnings.push('Download history unavailable.')
      return {
        points: [],
        weeklyDownloads: null as number | null,
        warning: 'Download history unavailable.',
      }
    }),
    fetchPackageReleases(packageName).catch(() => {
      warnings.push('Release history unavailable.')
      return {
        releases: [] as TrendsPackageSeries['releases'],
        publishDates: {} as Record<string, string>,
      }
    }),
  ])

  if (downloadsResult.warning) {
    warnings.push(downloadsResult.warning)
  }

  const [githubResult, sizeResult] = await Promise.all([
    repository
      ? fetchGithubTrendSeries(repository, range).catch(() => ({
          stars: [],
          issues: [],
          currentStars: null as number | null,
          currentIssues: null as number | null,
          warning: 'GitHub history unavailable.',
        }))
      : Promise.resolve({
          stars: [],
          issues: [],
          currentStars: null,
          currentIssues: null,
          warning: 'No GitHub repository found for this package.',
        }),
    fetchSizeSeries(packageName, releasesResult.publishDates).catch(() => ({
      points: [],
      latestGzip: null as number | null,
      latestSize: null as number | null,
    })),
  ])

  if (githubResult.warning) {
    warnings.push(githubResult.warning)
  }
  if (sizeResult.points.length === 0) {
    warnings.push('No cached bundle-size history yet.')
  }

  const stars = rollupPoints(
    filterPointsByRange(githubResult.stars, range),
    groupBy,
    'last',
    true
  )
  const issues = rollupPoints(
    filterPointsByRange(githubResult.issues, range),
    groupBy,
    'last',
    true
  )
  const size = rollupPoints(
    filterPointsByRange(sizeResult.points, range),
    groupBy,
    'last'
  )
  const downloads = rollupPoints(downloadsResult.points, groupBy, 'sum')
  const rangeStart = getTrendsRangeStart(range)

  if (stars.length > 0 && stars[0].date > rangeStart) {
    warnings.push(
      `GitHub history starts on ${stars[0].date}; earlier points are unavailable.`
    )
  }
  if (size.length > 0 && size[0].date > rangeStart) {
    warnings.push(
      `Bundle-size history starts on ${size[0].date}; earlier points are unavailable.`
    )
  }

  return {
    name: packageName,
    repository,
    downloads,
    stars,
    issues,
    size,
    releases: releasesResult.releases,
    current: {
      weeklyDownloads: downloadsResult.weeklyDownloads,
      stars: githubResult.currentStars,
      openIssues: githubResult.currentIssues,
      gzip: sizeResult.latestGzip,
      size: sizeResult.latestSize,
    },
    warnings,
  }
}

export async function buildTrendsResponse(
  rawPackages: string[],
  range: TrendsRange,
  groupBy: TrendsGroupBy
): Promise<TrendsResponse> {
  const names = uniquePackageNames(rawPackages)
  const packages = await Promise.all(
    names.map(name => buildPackageSeries(name, range, groupBy))
  )

  return {
    packages,
    range,
    groupBy,
    generatedAt: new Date().toISOString(),
  }
}

export function parsePackagesQuery(
  value: string | string[] | undefined
): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value || ''
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}
