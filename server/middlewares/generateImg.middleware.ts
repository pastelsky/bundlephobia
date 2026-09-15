import type { Middleware } from 'koa'
import send from 'koa-send'
import queryString from 'query-string'

import { createJavaScriptPackageReference } from '../../languages/javascript'
import CacheServiceClient from '../clients/cacheService'
import { drawStatsImg } from '../../utils/draw.utils'
import { packageAnalysisGateway } from '../analysis'

interface StatsImageResult {
  name: string
  version: string
  size: number
  gzip: number
}

function isThemeName(value: string | undefined): value is 'dark' | 'light' {
  return value === 'dark' || value === 'light'
}

const cache = new CacheServiceClient()

async function resolveImageVersion(name: string, version?: string) {
  const reference = createJavaScriptPackageReference(
    version ? `${name}@${version}` : name,
  )
  if (version && packageAnalysisGateway.isExactVersionSpecifier(reference)) {
    return version
  }
  return (await packageAnalysisGateway.resolvePackage(reference)).version
}

async function getStatsImage(query: Record<string, unknown>) {
  const parsedName = typeof query.name === 'string' ? query.name : undefined
  if (!parsedName) throw new Error('name query parameter is required')

  const rawTheme = typeof query.theme === 'string' ? query.theme : undefined
  const theme = isThemeName(rawTheme) ? rawTheme : undefined
  const wide = query.wide === 'true'
  const version = typeof query.version === 'string' ? query.version : undefined
  const resolvedVersion = await resolveImageVersion(parsedName, version)
  const result = await cache.getPackageSize<StatsImageResult>({
    name: parsedName,
    version: resolvedVersion,
  })
  if (!result) {
    throw new Error(
      `Missing cached package size for ${parsedName}@${resolvedVersion}`,
    )
  }
  return { result, theme, wide }
}

const generateImgMiddleware: Middleware = async ctx => {
  const url = ctx.url.replace(/&amp;/g, '&')
  const { query } = queryString.parseUrl(url)

  try {
    const { result, theme, wide } = await getStatsImage(query)

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
      'client/assets/public/android-chrome-192x192.png',
    )
  }
}

export default generateImgMiddleware
