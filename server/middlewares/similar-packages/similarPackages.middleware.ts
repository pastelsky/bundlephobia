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

interface AlgoliaPackageBody {
  description?: string
  keywords?: string[]
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

async function getPackageDetails(packageName: string) {
  const { body } = await got<AlgoliaPackageBody>(
    `https://ofcncog2cu-dsn.algolia.net/1/indexes/npm-search/${encodeURIComponent(
      packageName
    )}?x-algolia-application-id=OFCNCOG2CU&x-algolia-api-key=f54e21fa3a2a0160595bb058179bfb1e`,
    { json: true }
  )

  return body
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

  const { description, keywords } = await getPackageDetails(packageName)
  const tokenizer = new natural.WordTokenizer()
  const descriptionTokens =
    description === undefined
      ? []
      : tokenizer.tokenize(await stripMarkdown(description))
  const keywordTokens = (keywords ?? []).flatMap(keyword =>
    tokenizer.tokenize(keyword)
  )
  const packageTokens = descriptionTokens
    .concat(keywordTokens)
    .map(token => token.toLowerCase())
    .map(natural.PorterStemmer.stem)
    .concat(tokenizer.tokenize(packageName).map(natural.PorterStemmer.stem))

  let maxScoreCategory: { label: CategoryLabel | null; score: number } = {
    label: null,
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

    if (matchedCategory.label !== null) {
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
        similar: [],
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
