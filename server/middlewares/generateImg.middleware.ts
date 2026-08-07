import type { Middleware } from 'koa'
import send from 'koa-send'
import queryString from 'query-string'

import { createJavaScriptPackageReference } from '../../languages/javascript'
import { drawStatsImg } from '../../utils/draw.utils'
import { packageAnalysisGateway } from '../analysis'
import { javascriptStorage } from '../storage'

interface StatsImageResult {
  name: string
  version: string
  size: number
  gzip: number
}

function isThemeName(value: string | undefined): value is 'dark' | 'light' {
  return value === 'dark' || value === 'light'
}

const generateImgMiddleware: Middleware = async ctx => {
  const url = ctx.url.replace(/&amp;/g, '&')
  const { query } = queryString.parseUrl(url)
  const parsedName = typeof query.name === 'string' ? query.name : undefined
  const rawTheme = typeof query.theme === 'string' ? query.theme : undefined
  const theme = isThemeName(rawTheme) ? rawTheme : undefined
  const wide = query.wide === 'true'
  let version = typeof query.version === 'string' ? query.version : undefined

  try {
    if (!parsedName) {
      ctx.throw(400, 'name query parameter is required')
      return
    }

    const name = parsedName

    let resolvedVersion: string
    const reference = createJavaScriptPackageReference(
      version ? `${name}@${version}` : name
    )
    if (
      !version ||
      !packageAnalysisGateway.isExactVersionSpecifier(reference)
    ) {
      resolvedVersion = (await packageAnalysisGateway.resolvePackage(reference))
        .version
    } else {
      resolvedVersion = version
    }

    const result =
      await javascriptStorage.packageAnalysis.get<StatsImageResult>({
        name,
        version: resolvedVersion,
      })

    if (!result) {
      throw new Error(
        `Missing cached package size for ${name}@${resolvedVersion}`
      )
    }

    ctx.type = 'png'
    ctx.cacheControl = {
      maxAge: 60 * 60 * 60,
    }
    ctx.body = drawStatsImg({
      name: result.name,
      version: result.version,
      min: result.size,
      gzip: result.gzip,
      theme,
      wide,
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

export default generateImgMiddleware
