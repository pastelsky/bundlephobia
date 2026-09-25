import type { Middleware } from 'koa'
import createDebug from 'debug'
import strip from 'strip-markdown'

import { parsePackageString } from '../../../utils/common.utils'
import config from '../../config'
import logger from '../../infrastructure/logger.service'
import { categories } from './similar-packages.fixtures'

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

interface RepositoryInfo {
  host: string
  user: string
  project: string
  branch: string
  path: string
}

interface AlgoliaPackageBody {
  description?: string
  keywords?: string[]
  readme?: string
  repository: RepositoryInfo
}

type CategoryLabel = keyof typeof categories

type CategoryEntry = (typeof categories)[CategoryLabel]

type CategoryTag = CategoryEntry['tags'][number]

// SAFETY: the pinned got module exposes the request interface used here.
const got = require('got') as GotModule

// SAFETY: the pinned remark module exports the configured processor factory.
const remark = require('remark') as () => RemarkProcessor

// SAFETY: the pinned natural module exposes the tokenizer and stemmer APIs used here.
const natural = require('natural') as NaturalModule

const debug = createDebug('bp:similar')

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

async function getReadme(
  repository: RepositoryInfo,
): Promise<string | undefined> {
  const { host, user, project, branch, path } = repository

  if (host === 'github.com') {
    const getGithubFile = async (fileName: string) => {
      return got(
        String(
          prefixURL(fileName, {
            base: 'https://raw.githubusercontent.com',
            user,
            project,
            head: branch,
            path: path.replace(/\/tree\//, ''),
          }),
        ),
      )
    }

    try {
      return (await getGithubFile('README.md')).body
    } catch {
      try {
        return (await getGithubFile('readme.md')).body
      } catch {
        return (await getGithubFile('Readme.md')).body
      }
    }
  }

  if (host === 'gitlab.com') {
    const apiUrl = `https://gitlab.com/api/v4/projects/${user}%2F${project}/repository/files/${encodeURIComponent(
      `${path}/README.md`,
    )}?ref=${branch}`

    const { body } = await got<{
      encoding?: string
      content: string
    }>(apiUrl, { json: true })

    return body.encoding === 'base64'
      ? Buffer.from(body.content, 'base64').toString()
      : body.content
  }

  if (host === 'bitbucket.org') {
    const { body } = await got(
      `https://bitbucket.org/${user}/${project}${
        path ? path.replace('src', 'raw') : `/raw/${branch}`
      }/README.md`,
    )

    return body
  }

  return undefined
}

async function getPackageDetails(packageName: string) {
  let readme = ''

  const { body } = await got<AlgoliaPackageBody>(
    `https://ofcncog2cu-dsn.algolia.net/1/indexes/npm-search/${encodeURIComponent(
      packageName,
    )}?x-algolia-application-id=OFCNCOG2CU&x-algolia-api-key=f54e21fa3a2a0160595bb058179bfb1e`,
    { json: true },
  )

  if (body.readme?.trim()) {
    readme = await stripMarkdown(body.readme)
  } else {
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

/**
 * Scores a package against every category from its npm description and
 * keywords. Exported so the category fixtures can be tested without a network
 * round trip.
 */
export async function classifyPackage(
  packageName: string,
  {
    description = '',
    keywords = [],
  }: { description?: string; keywords?: string[] },
) {
  const tokenizer = new natural.WordTokenizer()

  const tokenString = `${await stripMarkdown(description)} ${keywords.join(
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

async function getCategory(packageName: string) {
  const directCategory = getInCategoryMap(packageName)

  if (directCategory) {
    return {
      label: directCategory,
      score: 999,
    }
  }

  return classifyPackage(packageName, await getPackageDetails(packageName))
}

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
