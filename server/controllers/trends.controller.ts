import type { Middleware } from 'koa'

import {
  MAX_TRENDS_PACKAGES,
  TRENDS_GROUP_BY,
  TRENDS_RANGES,
  type TrendsGroupBy,
  type TrendsRange,
} from '@bundlephobia/service-contracts/trends'
import config from '../config'
import logger from '../infrastructure/logger.service'
import { buildTrendsResponse } from '../services/trends.service'

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function packagesFromQuery(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : [value ?? ''])
    .flatMap(part => part.split(','))
    .map(part => part.trim())
    .filter(Boolean)
}

function isRange(value: string | undefined): value is TrendsRange {
  return Boolean(value && TRENDS_RANGES.some(item => item === value))
}

function isGroupBy(value: string | undefined): value is TrendsGroupBy {
  return Boolean(value && TRENDS_GROUP_BY.some(item => item === value))
}

function parseRange(value: string | undefined): TrendsRange {
  const range = TRENDS_RANGES.find(item => item === value)

  if (range) return range

  throw new Error('invalid trends range')
}

function parseGroupBy(value: string | undefined): TrendsGroupBy {
  const groupBy = TRENDS_GROUP_BY.find(item => item === value)

  if (groupBy) return groupBy

  throw new Error('invalid trends grouping')
}

function validateQuery(
  query: { packages: string[]; range: string; groupBy: string },
  throwBadRequest: (message: string) => never,
): void {
  const { packages, range, groupBy } = query

  if (packages.length === 0) {
    throwBadRequest('packages parameter is required')
  }

  if (packages.length > MAX_TRENDS_PACKAGES) {
    throwBadRequest(`a maximum of ${MAX_TRENDS_PACKAGES} packages is supported`)
  }

  if (!isRange(range)) throwBadRequest('invalid trends range')

  if (!isGroupBy(groupBy)) throwBadRequest('invalid trends grouping')
}

export function createTrendsController(): Middleware {
  return async ctx => {
    const packages = packagesFromQuery(ctx.query.packages)
    const rawRange = queryValue(ctx.query.range) ?? 'last-year'
    const rawGroupBy = queryValue(ctx.query.groupBy) ?? 'week'

    validateQuery({ packages, range: rawRange, groupBy: rawGroupBy }, message =>
      ctx.throw(400, message),
    )

    const range = parseRange(rawRange)
    const groupBy = parseGroupBy(rawGroupBy)

    try {
      ctx.cacheControl = { maxAge: config.CACHE.TRENDS_API }
      ctx.body = await buildTrendsResponse(packages, range, groupBy)
    } catch (error) {
      logger.error('TRENDS', error, `TRENDS FAILED: ${packages.join(',')}`)
      ctx.status = 422
      ctx.body = {
        type: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
