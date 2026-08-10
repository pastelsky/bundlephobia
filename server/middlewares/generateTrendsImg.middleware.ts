import type { Middleware } from 'koa'
import send from 'koa-send'
import queryString from 'query-string'

import { buildTrendsResponse, parsePackagesQuery } from '../trends/buildTrends'
import { isTrendsGroupBy, isTrendsRange } from '../trends/range'
import type { TrendsGroupBy, TrendsMetric, TrendsRange } from '../trends/types'
import { TRENDS_METRICS } from '../trends/types'
import { drawTrendsImg } from '../../utils/drawTrends.utils'

function isThemeName(value: string | undefined): value is 'dark' | 'light' {
  return value === 'dark' || value === 'light'
}

function isMetric(value: string | undefined): value is TrendsMetric {
  return !!value && (TRENDS_METRICS as string[]).includes(value)
}

const generateTrendsImgMiddleware: Middleware = async ctx => {
  const url = ctx.url.replace(/&amp;/g, '&')
  const { query } = queryString.parseUrl(url)
  const packages = parsePackagesQuery(
    typeof query.packages === 'string' ? query.packages : undefined
  )
  const rawMetric =
    typeof query.metric === 'string' ? query.metric : 'downloads'
  const metric: TrendsMetric = isMetric(rawMetric) ? rawMetric : 'downloads'
  const rawRange = typeof query.range === 'string' ? query.range : 'last-year'
  const range: TrendsRange = isTrendsRange(rawRange) ? rawRange : 'last-year'
  const rawGroupBy = typeof query.groupBy === 'string' ? query.groupBy : 'day'
  const groupBy: TrendsGroupBy = isTrendsGroupBy(rawGroupBy)
    ? rawGroupBy
    : 'day'
  const rawTheme = typeof query.theme === 'string' ? query.theme : undefined
  const theme = isThemeName(rawTheme) ? rawTheme : 'dark'

  try {
    if (packages.length === 0) {
      ctx.throw(400, 'packages query parameter is required')
      return
    }

    const trends = await buildTrendsResponse(packages, range, groupBy)
    ctx.type = 'jpg'
    ctx.cacheControl = {
      maxAge: 60 * 60,
    }
    ctx.body = drawTrendsImg({
      packages: trends.packages,
      metric,
      theme,
    })
  } catch (error) {
    console.error(error)
    ctx.cacheControl = {
      noCache: true,
    }
    await send(
      ctx as unknown as Parameters<typeof send>[0],
      'client/assets/public/android-chrome-192x192.png'
    )
  }
}

export default generateTrendsImgMiddleware
