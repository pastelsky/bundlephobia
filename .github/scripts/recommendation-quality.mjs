const WEEKLY_DOWNLOAD_MINIMUM = 1_000
const GITHUB_STAR_MINIMUM = 100
const RECENT_ACTIVITY_DAYS = 730

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
    alternative:
      answers.get('Alternative package or category') ??
      cleanIssueAnswer(legacyAlternative?.[1]),
    overlap: answers.get('Functional overlap') ?? '',
    advantage: answers.get('Why is this a better alternative?') ?? '',
    relationship: answers.get('Your relationship to the package') ?? '',
  }
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
  const response = await fetchImpl(url, options)

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }

  return response.json()
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

  const [downloads, github] = await Promise.all([
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

export const qualityThresholds = {
  weeklyDownloads: WEEKLY_DOWNLOAD_MINIMUM,
  githubStars: GITHUB_STAR_MINIMUM,
  recentActivityDays: RECENT_ACTIVITY_DAYS,
}
