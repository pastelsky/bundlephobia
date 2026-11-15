import type { Middleware } from 'koa'
import createDebug from 'debug'
import strip from 'strip-markdown'
import { z } from 'zod'

import { parsePackageString } from '../../../utils/common.utils'
import type { JsonValue } from '../../../types/json'
import config from '../../config'
import logger from '../../infrastructure/logger.service'
import { categories } from '../../../utils/similarPackages'

interface GotResponse<TBody> {
  body: TBody
}

interface ProcessedMarkdown {
  toString(): string
}

interface GotModule {
  <TBody = string>(
    url: string,
    options?: {
      json?: boolean
    },
  ): Promise<GotResponse<TBody>>
}

interface RemarkProcessor {
  use(plugin: typeof strip): RemarkProcessor
  process(
    input: string,
    callback: (error: Error | null, file: ProcessedMarkdown) => void,
  ): void
}

interface NaturalModule {
  WordTokenizer: new () => {
    tokenize(input: string): string[]
  }
  PorterStemmer: {
    stem(input: string): string
  }
}

interface ReadmeLocation {
  user: string
  project: string
  branch: string
  path: string
}

const repositoryInfoSchema = z
  .object({
    host: z.string().trim().min(1).nullish(),
    user: z.string().trim().min(1).nullish(),
    project: z.string().trim().min(1).nullish(),
    branch: z.string().trim().min(1).nullish(),
    path: z.string().trim().nullish(),
    head: z.string().trim().nullish(),
    url: z.string().trim().nullish(),
  })
  .passthrough()
  .nullish()

const algoliaPackageBodySchema = z
  .object({
    description: z.string().nullish(),
    keywords: z.array(z.string()).nullish(),
    readme: z.string().nullish(),
    repository: repositoryInfoSchema,
  })
  .passthrough()

const gitlabFileResponseSchema = z
  .object({
    encoding: z.string().nullish(),
    content: z.string().nullish(),
  })
  .passthrough()

export type RepositoryInfo = z.infer<typeof repositoryInfoSchema>

export type AlgoliaPackageBody = z.infer<typeof algoliaPackageBodySchema>

export function parseAlgoliaPackage(
  payload: JsonValue | undefined,
): AlgoliaPackageBody {
  const parsed = algoliaPackageBodySchema.safeParse(payload)

  return parsed.success ? parsed.data : {}
}

type CategoryLabel = keyof typeof categories

type CategoryEntry = (typeof categories)[CategoryLabel]

type CategoryTag = CategoryEntry['tags'][number]

// SAFETY: the pinned got module exposes the request interface used here.
const got = require('got') as GotModule

// SAFETY: the pinned remark module exports the configured processor factory.
const remark = require('remark') as () => RemarkProcessor

// SAFETY: the pinned subpath modules expose WordTokenizer without loading the full natural monolith.
const { WordTokenizer } = require('natural/lib/natural/tokenizers') as {
  WordTokenizer: NaturalModule['WordTokenizer']
}

// SAFETY: the pinned subpath modules expose PorterStemmer without loading the full natural monolith.
const PorterStemmer =
  require('natural/lib/natural/stemmers/porter_stemmer') as NaturalModule['PorterStemmer']

const natural: NaturalModule = {
  WordTokenizer,
  PorterStemmer,
}

const debugTest = createDebug('classifier:test')

const debug = createDebug('bp:similar')

const MIN_CUTOFF_SCORE = 12

function flatten<T>(items: T[][]): T[] {
  return items.flat()
}

const prefixURL = (
  url: string,
  options: {
    base: string
    user: string
    project: string
    head: string
    path: string
  },
) => {
  if (url.includes('//')) {
    return url
  }

  return new URL(
    `${options.path ? `${options.path.replace(/^\//, '')}/` : ''}${url.replace(
      /^(\.?\/?)/,
      '',
    )}`,
    `${options.base}/${options.user}/${options.project}/${
      options.path ? '' : `${options.head}/`
    }`,
  )
}

async function stripMarkdown(readme: string): Promise<string> {
  return new Promise((resolve, reject) => {
    remark()
      .use(strip)
      .process(readme, (error, file) => {
        if (error) {
          reject(error)

          return
        }

        resolve(
          String(file).replace(
            /\b(npm|code|library|Node|example|project|license|MIT)\b/gi,
            '',
          ),
        )
      })
  })
}

function cleanRepositoryPath(path: string | null | undefined): string {
  if (!path) {
    return ''
  }

  return path.replace(/\/tree\//, '').replace(/^\//, '')
}

function resolveRepositoryBranch(repository: RepositoryInfo): string {
  return repository?.branch || repository?.head || 'master'
}

async function fetchGithubReadme(
  location: ReadmeLocation,
): Promise<string | undefined> {
  const getFile = async (fileName: string) => {
    return got(
      String(
        prefixURL(fileName, {
          base: 'https://raw.githubusercontent.com',
          user: location.user,
          project: location.project,
          head: location.branch,
          path: location.path,
        }),
      ),
    )
  }

  const candidateFileNames = ['README.md', 'readme.md', 'Readme.md']

  for (const fileName of candidateFileNames) {
    try {
      const response = await getFile(fileName)

      return response.body
    } catch {
      // Continue to next filename candidate on 404 or request error
    }
  }

  return undefined
}

async function fetchGitlabReadme(
  location: ReadmeLocation,
): Promise<string | undefined> {
  const filePath = location.path ? `${location.path}/README.md` : 'README.md'

  const apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(
    `${location.user}/${location.project}`,
  )}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(
    location.branch,
  )}`

  // SAFETY: GitLab file API response is parsed via gitlabFileResponseSchema
  const response = await got<JsonValue>(apiUrl, { json: true })
  const parsed = gitlabFileResponseSchema.safeParse(response.body)

  if (!parsed.success || !parsed.data.content) {
    return undefined
  }

  return parsed.data.encoding === 'base64'
    ? Buffer.from(parsed.data.content, 'base64').toString()
    : parsed.data.content
}

async function fetchBitbucketReadme(
  location: ReadmeLocation,
): Promise<string | undefined> {
  const subPath = location.path
    ? location.path.replace(/^src\/?/, 'raw/')
    : `raw/${location.branch}`

  const response = await got(
    `https://bitbucket.org/${location.user}/${location.project}/${subPath}/README.md`,
  )

  return response.body
}

export async function getReadme(
  repository?: RepositoryInfo | null,
): Promise<string | undefined> {
  if (!repository?.host || !repository.user || !repository.project) {
    return undefined
  }

  const location: ReadmeLocation = {
    user: repository.user,
    project: repository.project,
    branch: resolveRepositoryBranch(repository),
    path: cleanRepositoryPath(repository.path),
  }

  if (repository.host === 'github.com') {
    return fetchGithubReadme(location)
  }

  if (repository.host === 'gitlab.com') {
    return fetchGitlabReadme(location)
  }

  if (repository.host === 'bitbucket.org') {
    return fetchBitbucketReadme(location)
  }

  return undefined
}

export async function getPackageDetails(
  packageName: string,
): Promise<AlgoliaPackageBody & { readme: string }> {
  let readme = ''
  let body: AlgoliaPackageBody = {}

  try {
    // SAFETY: Algolia npm-search payload is parsed via algoliaPackageBodySchema
    const response = await got<JsonValue>(
      `https://ofcncog2cu-dsn.algolia.net/1/indexes/npm-search/${encodeURIComponent(
        packageName,
      )}?x-algolia-application-id=OFCNCOG2CU&x-algolia-api-key=f54e21fa3a2a0160595bb058179bfb1e`,
      { json: true },
    )

    body = parseAlgoliaPackage(response.body)
  } catch (error) {
    debug(
      'failed to fetch package details from algolia for %s: %o',
      packageName,
      error,
    )
  }

  if (body.readme?.trim()) {
    readme = await stripMarkdown(body.readme)
  } else if (body.repository) {
    try {
      const readmeMarkdown = await getReadme(body.repository)
      readme = readmeMarkdown ? await stripMarkdown(readmeMarkdown) : ''
    } catch (error) {
      console.error(`error getting readme contents for ${packageName}`, error)
    }
  }

  return { ...body, readme }
}

function getScore(categoryTokens: CategoryTag[], packageTokens: string[]) {
  const packageTokensWithoutDupes = Array.from(new Set(packageTokens))

  return packageTokensWithoutDupes.reduce((accumulator, currentToken) => {
    const match = categoryTokens.find(token => token.tag === currentToken)

    return match ? accumulator + match.weight : accumulator
  }, 0)
}

function getInCategoryMap(packageName: string) {
  // SAFETY: categories is the closed category registry declared above.
  return (Object.keys(categories) as CategoryLabel[]).find(label =>
    categories[label].similar.some(
      similarPackage => similarPackage === packageName,
    ),
  )
}

async function getCategory(packageName: string) {
  const directCategory = getInCategoryMap(packageName)

  if (directCategory) {
    return {
      label: directCategory,
      score: 999,
    }
  }

  const { description, keywords } = await getPackageDetails(packageName)

  const tokenizer = new natural.WordTokenizer()

  const safeDescription = description ?? ''
  const safeKeywords = keywords ?? []

  const tokenString = `${await stripMarkdown(safeDescription)} ${safeKeywords.join(
    ' ',
  )}`

  const packageTokens = tokenizer
    .tokenize(tokenString)
    .map(token => token.toLowerCase())
    .map(natural.PorterStemmer.stem)
    .concat(tokenizer.tokenize(packageName).map(natural.PorterStemmer.stem))

  interface CategoryResult {
    label?: CategoryLabel
    score: number
  }

  let maxScoreCategory: CategoryResult = {
    score: 0,
  }

  // SAFETY: categories is the closed category registry declared above.
  const categoryLabels = Object.keys(categories) as CategoryLabel[]
  categoryLabels.forEach(label => {
    const categoryTokens = flatten(
      categories[label].tags.map(tagObject =>
        tokenizer.tokenize(tagObject.tag).map(tokenizedTag => ({
          tag: natural.PorterStemmer.stem(tokenizedTag).toLowerCase(),
          weight: tagObject.weight,
        })),
      ),
    )

    const score = getScore(categoryTokens, packageTokens)

    if (score > maxScoreCategory.score) {
      maxScoreCategory = { label, score }
    }
  })

  return maxScoreCategory
}

async function test() {
  // SAFETY: categories is the closed category registry declared above.
  const categoryLabels = Object.keys(categories) as CategoryLabel[]
  categoryLabels.forEach(label => {
    categories[label].similar.forEach(async pack => {
      const actualCategory = await getCategory(pack)

      if (
        !actualCategory ||
        actualCategory.label !== label ||
        actualCategory.score < MIN_CUTOFF_SCORE
      ) {
        debugTest(
          'Package %s. Category expected: %s, got: %o',
          pack,
          label,
          actualCategory,
        )
      }
    })
  })
}

void test

const similarPackagesMiddleware: Middleware = async ctx => {
  const packageQuery = ctx.query.package

  const packageString = Array.isArray(packageQuery)
    ? packageQuery.join('/')
    : packageQuery

  if (!packageString) {
    ctx.throw(400, 'package query parameter is required')

    return
  }

  const { name } = parsePackageString(packageString)

  try {
    const matchedCategory = await getCategory(name)
    debug('Category for %s : %o', name, matchedCategory)

    if (matchedCategory.label) {
      const value = categories[matchedCategory.label]

      ctx.cacheControl = {
        maxAge: config.CACHE.SIMILAR_API,
      }

      ctx.body = {
        name,
        category: {
          ...matchedCategory,
          label: value.name,
          tags: value.tags,
          similar: value.similar.filter(pack => pack !== name),
        },
      }

      return
    }

    ctx.body = {
      name,
      category: {
        label: null,
        score: 0,
        similarPackages: [],
      },
    }
  } catch (error) {
    console.error(error)
    ctx.status = 500
    ctx.body = {
      error,
    }

    logger.error(
      'SIMILAR_PACKAGES_ERROR',
      {
        type: 'SIMIAR_PACKAGES',
        requestId: ctx.state.id,
        name,
        details: error,
      },
      `SIMILAR PACKAGES FAILED: ${name}`,
    )
  }
}

export default similarPackagesMiddleware
