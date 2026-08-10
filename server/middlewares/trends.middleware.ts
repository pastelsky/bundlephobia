import type { Middleware } from 'koa'

import config from '../config'
import { buildTrendsResponse, parsePackagesQuery } from '../trends/buildTrends'
import { isTrendsGroupBy, isTrendsRange } from '../trends/range'
import type { TrendsGroupBy, TrendsRange } from '../trends/types'

const trendsMiddleware: Middleware = async ctx => {
  const packages = parsePackagesQuery(ctx.query.packages)
  if (packages.length === 0) {
    ctx.status = 400
    ctx.body = {
      error: {
        code: 'BadRequest',
        message: 'packages query parameter is required',
      },
    }
    return
  }

  const rawRange =
    typeof ctx.query.range === 'string' ? ctx.query.range : 'last-year'
  const range: TrendsRange = isTrendsRange(rawRange) ? rawRange : 'last-year'
  const rawGroupBy =
    typeof ctx.query.groupBy === 'string' ? ctx.query.groupBy : 'day'
  const groupBy: TrendsGroupBy = isTrendsGroupBy(rawGroupBy)
    ? rawGroupBy
    : 'day'

  try {
    ctx.cacheControl = {
      maxAge: config.CACHE.TRENDS_API,
    }
    ctx.body = await buildTrendsResponse(packages, range, groupBy)
  } catch (error) {
    console.error(error)
    ctx.status = 422
    ctx.body = {
      error: {
        code: 'TrendsError',
        message:
          error instanceof Error ? error.message : 'Failed to load trends',
      },
    }
  }
}

export default trendsMiddleware
