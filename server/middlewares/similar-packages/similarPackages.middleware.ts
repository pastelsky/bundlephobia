import type { Middleware } from 'koa'
import createDebug from 'debug'
import strip from 'strip-markdown'

import { parsePackageString } from '../../../utils/common.utils'
import config from '../../config'
import logger from '../../Logger'
import { categories } from './fixtures'

interface GotResponse<TBody> {
  body: TBody
}

interface GotModule {
  <TBody = string>(
    url: string,
    options?: {
      json?: boolean
    }
  ): Promise<GotResponse<TBody>>
}

interface RemarkProcessor {
  use(plugin: unknown): RemarkProcessor
  process(
    input: string,
    callback: (error: Error | null, file: unknown) => void
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
  [key: string]: unknown
}

type CategoryLabel = keyof typeof categories
type CategoryEntry = (typeof categories)[CategoryLabel]
type CategoryTag = CategoryEntry['tags'][number]

const got = require('got') as GotModule
const remark = require('remark') as () => RemarkProcessor
const natural = require('natural') as NaturalModule

const debugTest = createDebug('classifier:test')
const debug = createDebug('bp:similar')

const MIN_CUTOFF_SCORE = 12

function flatten<T>(items: T[][]): T[] {
  return items.reduce<T[]>((accumulator, item) => accumulator.concat(item), [])
}

const prefixURL = (
  url: string,
  options: {
    base: string
    user: string
    project: string
    head: string
    path: string
  }
) => {
  if (url.includes('//')) {
    return url
  }

  return new URL(
    `${options.path ? `${options.path.replace(/^\//, '')}/` : ''}${url.replace(
      /^(\.?\/?)/,
      ''
    )}`,
    `${options.base}/${options.user}/${options.project}/${
      options.path ? '' : `${options.head}/`
    }`
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
            ''
          )
        )
      })
  })
}

async function getReadme(
  repository: RepositoryInfo
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
          })
        )
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
      `${path}/README.md`
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
      }/README.md`
    )
    return body
  }

  return undefined
}

async function getPackageDetails(packageName: string) {
  let readme = ''
  const { body } = await got<AlgoliaPackageBody>(
    `https://ofcncog2cu-dsn.algolia.net/1/indexes/npm-search/${encodeURIComponent(
      packageName
    )}?x-algolia-application-id=OFCNCOG2CU&x-algolia-api-key=f54e21fa3a2a0160595bb058179bfb1e`,
    { json: true }
  )

  if (typeof body.readme === 'string' && body.readme.trim()) {
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
  return (Object.keys(categories) as CategoryLabel[]).find(label =>
    categories[label].similar.some(
      similarPackage => similarPackage === packageName
    )
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

  const { description = '', keywords = [] } = await getPackageDetails(
    packageName
  )
  const tokenizer = new natural.WordTokenizer()
  const tokenString = `${await stripMarkdown(description)} ${keywords.join(
    ' '
  )}`
  const packageTokens = tokenizer
    .tokenize(tokenString)
    .map(token => token.toLowerCase())
    .map(natural.PorterStemmer.stem)
    .concat(tokenizer.tokenize(packageName).map(natural.PorterStemmer.stem))

  let maxScoreCategory: { label?: CategoryLabel; score: number } = {
    score: 0,
  }

  ;(Object.keys(categories) as CategoryLabel[]).forEach(label => {
    const categoryTokens = flatten(
      categories[label].tags.map(tagObject =>
        tokenizer.tokenize(tagObject.tag).map(tokenizedTag => ({
          tag: natural.PorterStemmer.stem(tokenizedTag).toLowerCase(),
          weight: tagObject.weight,
        }))
      )
    )

    const score = getScore(categoryTokens, packageTokens)
    if (score > maxScoreCategory.score) {
      maxScoreCategory = { label, score }
    }
  })

  return maxScoreCategory
}

async function test() {
  ;(Object.keys(categories) as CategoryLabel[]).forEach(label => {
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
          actualCategory
        )
      }
    })
  })
}

void test

const similarPackagesMiddleware: Middleware = async ctx => {
  const packageQuery = ctx.query.package
  const packageString =
    typeof packageQuery === 'string' ? packageQuery : packageQuery?.join('/')

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
      `SIMILAR PACKAGES FAILED: ${name}`
    )
  }
}

export default similarPackagesMiddleware
