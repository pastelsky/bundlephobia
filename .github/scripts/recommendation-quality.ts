import gitUrlParse from 'git-url-parse'
import validatePackageName from 'validate-npm-package-name'
import semver from 'semver'
import { z } from 'zod'

export type FetchJson = (
  url: string,
  options?: RequestInit,
) => Promise<{
  ok: boolean
  status?: number
  // The response is parsed with the caller's endpoint schema before domain use.
  // oxlint-disable-next-line anti-slop/no-unknown-returns
  json: () => Promise<unknown>
}>

const manifestSchema = z.object({
  name: z.string().optional(),
  repository: z.unknown().optional(),
  deprecated: z.string().optional(),
})

const registrySchema = z.object({
  'dist-tags': z.object({ latest: z.string().optional() }).optional(),
  time: z.record(z.string(), z.string()).optional(),
  versions: z.record(z.string(), manifestSchema).optional(),
  repository: z.unknown().optional(),
})

const githubSchema = z.object({
  stargazers_count: z.number().optional(),
  archived: z.boolean().optional(),
  pushed_at: z.string().optional(),
  updated_at: z.string().optional(),
})

const sizeSchema = z.object({
  version: z.string(),
  size: z.number(),
  gzip: z.number(),
})

type BundleSize =
  | { available: false; version: null; size: null; gzip: null }
  | { available: true; version: string; size: number; gzip: number }

type PackageSignals = {
  packageName?: string
  exists: boolean | null
  latestVersion?: string | null
  publishedAt?: string | null
  deprecated?: boolean
  repository?: string | null
  githubStars?: number | null
  repositoryArchived?: boolean | null
  repositoryPushedAt?: string | null
  weeklyDownloads?: number | null
  popular?: boolean
  activeOrStable?: boolean
  bundleSize?: BundleSize | null
}

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
    /\*\*Package name\*\*\s*\n+([\s\S]*?)(?=\n+\*\*Alternative to\*\*)/i,
  )

  const legacyAlternative = body.match(
    /\*\*Alternative to\*\*\s*\n+([\s\S]*?)(?=\n+(?:<!--|\*\*Quality check\*\*))/i,
  )

  return {
    packageName:
      answers.get('npm package name') ?? cleanIssueAnswer(legacyPackage?.[1]),
    alternative:
      answers.get('Alternative npm packages') ??
      answers.get('Alternative package or category') ??
      cleanIssueAnswer(legacyAlternative?.[1]),
    advantage: answers.get('Why is this a better alternative?') ?? '',
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
    /^https?:\/\/(?:www\.)?npmjs\.com\/package\/([^/?#]+(?:\/[^/?#]+)?)/,
  )

  return (markdownLink?.[1] ?? npmUrl?.[1] ?? value)
    .trim()
    .replace(/^`|`$/g, '')
}

export function isPlausiblePackageName(packageName: string) {
  return validatePackageName(packageName).validForNewPackages
}

// npm repository metadata is untrusted and may be absent, a URL, or an object.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function extractGitHubRepository(repository: unknown): string | null {
  const parsed = z
    .union([z.string(), z.object({ url: z.string() })])
    .safeParse(repository)

  if (!parsed.success) return null
  const value = parsed.data
  // The parser supports npm's HTTPS, git+HTTPS, SSH and SCP repository forms.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  const url = gitUrlParse(typeof value === 'string' ? value : value.url)

  return url.resource.toLowerCase() === 'github.com' && url.owner && url.name
    ? `${url.owner}/${url.name}`
    : null
}

function isRecent(date: string | null | undefined, now = new Date()) {
  if (!date) return false

  const age = now.getTime() - new Date(date).getTime()

  return Number.isFinite(age) && age <= RECENT_ACTIVITY_DAYS * 86_400_000
}

function isStableVersion(version = '') {
  const parsed = semver.parse(version)

  return Boolean(parsed && parsed.major >= 1 && !parsed.prerelease.length)
}

async function fetchJson(
  url: string | URL,
  options: RequestInit | undefined,
  fetchImpl: FetchJson,
  // Raw HTTP JSON; consumers immediately validate it with the endpoint schema.
  // oxlint-disable-next-line anti-slop/no-unknown-returns
): Promise<unknown> {
  const requestUrl = String(url)
  const response = await fetchImpl(requestUrl, options)

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(`${requestUrl} returned HTTP ${response.status}`)
  }

  return response.json()
}

export async function collectBundleSize(
  packageName: string,
  { fetchImpl = fetch }: { fetchImpl?: FetchJson } = {},
): Promise<BundleSize> {
  const url = new URL('https://bundlephobia.com/api/size')
  url.searchParams.set('package', packageName)

  try {
    const result = sizeSchema.parse(await fetchJson(url, undefined, fetchImpl))

    return {
      available: true,
      version: result?.version ?? null,
      size: result?.size ?? null,
      gzip: result?.gzip ?? null,
    }
  } catch {
    return {
      available: false,
      version: null,
      size: null,
      gzip: null,
    }
  }
}

export async function collectPackageSignals(
  packageName: string,
  {
    fetchImpl = fetch,
    githubToken = process.env.GITHUB_TOKEN,
    includeBundleSize = true,
  }: {
    fetchImpl?: FetchJson
    githubToken?: string
    includeBundleSize?: boolean
  } = {},
): Promise<PackageSignals> {
  const encodedName = encodeURIComponent(packageName)
  let registry

  try {
    registry = registrySchema
      .nullable()
      .parse(
        await fetchJson(
          `https://registry.npmjs.org/${encodedName}`,
          undefined,
          fetchImpl,
        ),
      )
  } catch {
    return {
      packageName,
      exists: null,
    }
  }

  if (!registry) {
    return { packageName, exists: false }
  }

  const latestVersion = registry['dist-tags']?.latest ?? null

  const latestManifest = latestVersion
    ? (registry.versions?.[latestVersion] ?? {})
    : {}

  const repository = extractGitHubRepository(
    latestManifest.repository ?? registry.repository,
  )

  const githubHeaders = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bundlephobia-recommendation-checker',
  })

  if (githubToken) githubHeaders.set('Authorization', `Bearer ${githubToken}`)

  const [downloads, github, bundleSize] = await Promise.all([
    fetchJson(
      `https://api.npmjs.org/downloads/point/last-week/${encodedName}`,
      undefined,
      fetchImpl,
    )
      .then(value =>
        z.object({ downloads: z.number() }).nullable().parse(value),
      )
      .catch(() => null),
    repository
      ? fetchJson(
          `https://api.github.com/repos/${repository}`,
          {
            headers: githubHeaders,
          },
          fetchImpl,
        )
          .then(value => githubSchema.nullable().parse(value))
          .catch(() => null)
      : null,
    includeBundleSize ? collectBundleSize(packageName, { fetchImpl }) : null,
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
    repository,
    githubStars,
    repositoryArchived: github?.archived ?? null,
    repositoryPushedAt: github?.pushed_at ?? null,
    weeklyDownloads,
    popular:
      (weeklyDownloads ?? 0) >= WEEKLY_DOWNLOAD_MINIMUM ||
      (githubStars ?? 0) >= GITHUB_STAR_MINIMUM,
    activeOrStable: recentActivity || isStableVersion(latestVersion ?? ''),
    bundleSize,
  }
}

export function evaluateRecommendation(
  signals: PackageSignals,
  answers: { advantage?: string } = {},
) {
  const errors = []
  const notes = []

  if (signals.exists === false) errors.push('The package was not found on npm.')

  if (signals.exists === null) {
    notes.push(
      'The npm registry could not be checked; retry or review manually.',
    )
  }

  if (signals.deprecated) errors.push('The latest npm version is deprecated.')

  if (signals.repositoryArchived) {
    notes.push('The linked source repository is archived.')
  }

  if (signals.exists && !signals.popular) {
    notes.push(
      `Popularity is below ${WEEKLY_DOWNLOAD_MINIMUM.toLocaleString()} weekly npm downloads and ${GITHUB_STAR_MINIMUM.toLocaleString()} GitHub stars.`,
    )
  }

  if (signals.exists && !signals.activeOrStable) {
    notes.push(
      `No activity was found in the last ${RECENT_ACTIVITY_DAYS} days and the latest release is not a stable 1.x-or-newer version.`,
    )
  }

  if (answers.advantage !== undefined && answers.advantage.trim().length < 40) {
    notes.push('The relative-advantage explanation needs more detail.')
  }

  return {
    errors,
    notes,
    status: errors.length
      ? 'invalid'
      : notes.length
        ? 'needs review'
        : 'ready for maintainer review',
  }
}

export function evaluateSizeAdvantage(
  candidate: {
    bundleSize?: { available: boolean; gzip: number | null } | null
  },
  alternatives: Array<{
    packageName: string
    bundleSize?: { available: boolean; gzip: number | null } | null
  }>,
) {
  const availableAlternatives = alternatives.flatMap(alternative => {
    const size = alternative.bundleSize

    return size?.available && size.gzip !== null
      ? [{ packageName: alternative.packageName, gzip: size.gzip }]
      : []
  })

  const candidateGzip = candidate.bundleSize?.available
    ? candidate.bundleSize.gzip
    : null

  const smallerThan =
    candidateGzip !== null
      ? availableAlternatives.filter(
          alternative => candidateGzip < alternative.gzip,
        )
      : []

  return {
    available: candidateGzip !== null && availableAlternatives.length > 0,
    smallerThan: smallerThan.map(alternative => alternative.packageName),
  }
}

export function extractCuratedRecommendations(source: string) {
  const recommendations = new Set()
  const similarArrayPattern = /\bsimilar:\s*\[([\s\S]*?)\]/g

  for (const arrayMatch of source.matchAll(similarArrayPattern)) {
    for (const packageMatch of arrayMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
      recommendations.add(packageMatch[1])
    }
  }

  return recommendations
}

export function extractCuratedCategories(source: string) {
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

export const maxRecommendationsPerCategory = MAX_RECOMMENDATIONS_PER_CATEGORY
