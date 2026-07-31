const WEEKLY_DOWNLOAD_MINIMUM = 1_000
const GITHUB_STAR_MINIMUM = 100
const RECENT_ACTIVITY_DAYS = 730
const MAX_RECOMMENDATIONS_PER_CATEGORY = 6

function cleanIssueAnswer(value = '') {
  const answer = value.trim()
  return answer === '_No response_' ? '' : answer
}

export function extractIssueFormAnswers(body = '') {
  const answers = new Map()
  const headingPattern = /^###\s+(.+?)\s*$\n([\s\S]*?)(?=^###\s+|\s*$)/gm

  for (const match of body.matchAll(headingPattern)) {
    answers.set(match[1].trim(), cleanIssueAnswer(match[2]))
  }

  const legacyPackage = body.match(
    /\*\*Package name\*\*\s*\n+([\s\S]*?)(?=\n+\*\*Alternative to\*\*)/i
  )
  const legacyAlternative = body.match(
    /\*\*Alternative to\*\*\s*\n+([\s\S]*?)(?=\n+(?:<!--|\*\*Quality check\*\*))/i
  )

  return {
    packageName:
      answers.get('npm package name') ?? cleanIssueAnswer(legacyPackage?.[1]),
    category: answers.get('Bundlephobia category') ?? '',
    alternative:
      answers.get('Alternative npm packages') ??
      answers.get('Alternative package or category') ??
      cleanIssueAnswer(legacyAlternative?.[1]),
    overlap: answers.get('Functional overlap') ?? '',
    advantage: answers.get('Why is this a better alternative?') ?? '',
    relationship: answers.get('Your relationship to the package') ?? '',
  }
}

export function parsePackageNames(value = '') {
  return [
    ...new Set(value.split(/[,\n]/).map(normalizePackageName).filter(Boolean)),
  ]
}

export function normalizePackageName(value = '') {
  const markdownLink = value.match(/^\[([^\]]+)\]\([^)]+\)$/)
  const npmUrl = value.match(
    /^https?:\/\/(?:www\.)?npmjs\.com\/package\/([^/?#]+(?:\/[^/?#]+)?)/
  )

  return (markdownLink?.[1] ?? npmUrl?.[1] ?? value)
    .trim()
    .replace(/^`|`$/g, '')
}

export function isPlausiblePackageName(packageName) {
  return /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(
    packageName
  )
}

export function extractGitHubRepository(repository) {
  const value =
    typeof repository === 'string' ? repository : repository?.url ?? ''
  const match = value.match(
    /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:#.*)?$/i
  )

  return match ? `${match[1]}/${match[2]}` : null
}

function isRecent(date, now = new Date()) {
  if (!date) return false

  const age = now.getTime() - new Date(date).getTime()
  return Number.isFinite(age) && age <= RECENT_ACTIVITY_DAYS * 86_400_000
}

export function isStableVersion(version = '') {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-|$)/)
  return Boolean(match && Number(match[1]) >= 1 && !version.includes('-'))
}

async function fetchJson(url, options, fetchImpl) {
  const requestUrl = String(url)
  const response = await fetchImpl(requestUrl, options)

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`${requestUrl} returned HTTP ${response.status}`)
  }

  return response.json()
}

export async function collectBundleSize(
  packageName,
  { fetchImpl = fetch } = {}
) {
  const url = new URL('https://bundlephobia.com/api/size')
  url.searchParams.set('package', packageName)

  try {
    const result = await fetchJson(url, undefined, fetchImpl)
    return {
      available: Number.isFinite(result?.gzip),
      version: result?.version ?? null,
      size: result?.size ?? null,
      gzip: result?.gzip ?? null,
    }
  } catch (error) {
    return {
      available: false,
      version: null,
      size: null,
      gzip: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function collectPackageSignals(
  packageName,
  { fetchImpl = fetch, githubToken = process.env.GITHUB_TOKEN } = {}
) {
  const encodedName = encodeURIComponent(packageName)
  const registry = await fetchJson(
    `https://registry.npmjs.org/${encodedName}`,
    undefined,
    fetchImpl
  )

  if (!registry) {
    return { packageName, exists: false }
  }

  const latestVersion = registry['dist-tags']?.latest ?? null
  const latestManifest = latestVersion
    ? registry.versions?.[latestVersion] ?? {}
    : {}
  const repository = extractGitHubRepository(
    latestManifest.repository ?? registry.repository
  )

  const [downloads, github, bundleSize] = await Promise.all([
    fetchJson(
      `https://api.npmjs.org/downloads/point/last-week/${encodedName}`,
      undefined,
      fetchImpl
    ).catch(() => null),
    repository
      ? fetchJson(
          `https://api.github.com/repos/${repository}`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'bundlephobia-recommendation-checker',
              ...(githubToken
                ? { Authorization: `Bearer ${githubToken}` }
                : {}),
            },
          },
          fetchImpl
        ).catch(() => null)
      : null,
    collectBundleSize(packageName, { fetchImpl }),
  ])

  const publishedAt = latestVersion ? registry.time?.[latestVersion] : null
  const weeklyDownloads = downloads?.downloads ?? null
  const githubStars = github?.stargazers_count ?? null
  const recentActivity =
    isRecent(publishedAt) || isRecent(github?.pushed_at ?? github?.updated_at)

  return {
    packageName,
    exists: true,
    latestVersion,
    publishedAt,
    deprecated: Boolean(latestManifest.deprecated),
    deprecationMessage: latestManifest.deprecated ?? null,
    repository,
    githubStars,
    repositoryArchived: github?.archived ?? null,
    repositoryPushedAt: github?.pushed_at ?? null,
    weeklyDownloads,
    popularityPass:
      (weeklyDownloads ?? 0) >= WEEKLY_DOWNLOAD_MINIMUM ||
      (githubStars ?? 0) >= GITHUB_STAR_MINIMUM,
    maintenancePass: recentActivity || isStableVersion(latestVersion ?? ''),
    recentActivity,
    stableVersion: isStableVersion(latestVersion ?? ''),
    bundleSize,
  }
}

export function evaluateRecommendation(signals, answers = {}) {
  const blockers = []
  const needsEvidence = []

  if (!signals.exists) blockers.push('The package was not found on npm.')
  if (signals.deprecated) blockers.push('The latest npm version is deprecated.')
  if (signals.repositoryArchived) {
    needsEvidence.push('The linked source repository is archived.')
  }
  if (signals.exists && !signals.popularityPass) {
    needsEvidence.push(
      `Popularity is below ${WEEKLY_DOWNLOAD_MINIMUM.toLocaleString()} weekly npm downloads and ${GITHUB_STAR_MINIMUM.toLocaleString()} GitHub stars.`
    )
  }
  if (signals.exists && !signals.maintenancePass) {
    needsEvidence.push(
      `No activity was found in the last ${RECENT_ACTIVITY_DAYS} days and the latest release is not a stable 1.x-or-newer version.`
    )
  }
  if (answers.overlap !== undefined && answers.overlap.trim().length < 40) {
    needsEvidence.push('The functional-overlap explanation needs more detail.')
  }
  if (answers.advantage !== undefined && answers.advantage.trim().length < 40) {
    needsEvidence.push('The relative-advantage explanation needs more detail.')
  }

  return {
    blockers,
    needsEvidence,
    status: blockers.length
      ? 'invalid'
      : needsEvidence.length
      ? 'needs evidence'
      : 'ready for maintainer review',
  }
}

export function evaluateSizeAdvantage(candidate, alternatives) {
  const availableAlternatives = alternatives.filter(
    alternative => alternative.bundleSize?.available
  )
  const findings = []

  if (!candidate.bundleSize?.available) {
    findings.push('Bundlephobia could not measure the candidate package.')
  }
  if (!availableAlternatives.length) {
    findings.push('No comparison package size was available.')
  }

  const smallerThan = candidate.bundleSize?.available
    ? availableAlternatives.filter(
        alternative => candidate.bundleSize.gzip < alternative.bundleSize.gzip
      )
    : []

  if (
    candidate.bundleSize?.available &&
    availableAlternatives.length &&
    !smallerThan.length
  ) {
    findings.push(
      'The candidate is not smaller than any of the comparison packages.'
    )
  }

  return {
    pass:
      Boolean(candidate.bundleSize?.available) &&
      availableAlternatives.length > 0 &&
      smallerThan.length > 0,
    findings,
    smallerThan: smallerThan.map(alternative => alternative.packageName),
    availableAlternatives,
  }
}

export function extractCuratedRecommendations(source) {
  const recommendations = new Set()
  const similarArrayPattern = /\bsimilar:\s*\[([\s\S]*?)\]/g

  for (const arrayMatch of source.matchAll(similarArrayPattern)) {
    for (const packageMatch of arrayMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
      recommendations.add(packageMatch[1])
    }
  }

  return recommendations
}

export function extractCuratedCategories(source) {
  const categories = new Map()
  const categoryPattern =
    /^  (?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9-]+)):\s*\{([\s\S]*?)^  \},/gm

  for (const match of source.matchAll(categoryPattern)) {
    const slug = match[1] ?? match[2] ?? match[3]
    const body = match[4]
    const name = body.match(/^    name:\s*['"]([^'"]+)['"],/m)?.[1] ?? slug
    const packages = extractCuratedRecommendations(body)

    categories.set(slug, { slug, name, packages })
  }

  return categories
}

export const qualityThresholds = {
  weeklyDownloads: WEEKLY_DOWNLOAD_MINIMUM,
  githubStars: GITHUB_STAR_MINIMUM,
  recentActivityDays: RECENT_ACTIVITY_DAYS,
  maxRecommendationsPerCategory: MAX_RECOMMENDATIONS_PER_CATEGORY,
}
