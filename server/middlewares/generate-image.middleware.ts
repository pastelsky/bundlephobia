import type { Middleware } from 'koa'
import send from 'koa-send'
import queryString from 'query-string'
import type { ParsedQuery } from 'query-string'

import type {
  CacheKey,
  CacheReadResult,
  PackageCacheResult,
} from '@bundlephobia/service-contracts/cache'

import { createJavaScriptPackageReference } from '../../languages/javascript'
import { drawStatsImg } from '../../utils/draw.utils'
import { packageAnalysisGateway } from '../analysis'

interface StatsImageResult {
  name: string
  version: string
  size: number
  gzip: number
}

interface StatsImageCache {
  getPackageSize(key: CacheKey): Promise<CacheReadResult<PackageCacheResult>>
}

function asSendContext(
  context: Parameters<Middleware>[0],
): Parameters<typeof send>[0] {
  // SAFETY: koa-send consumes the same Koa request context contract.
  return context as Parameters<typeof send>[0] & Parameters<Middleware>[0]
}

function isThemeName(value: string | undefined): value is 'dark' | 'light' {
  return value === 'dark' || value === 'light'
}

async function resolveImageVersion(name: string, version?: string) {
  const reference = createJavaScriptPackageReference(
    version ? `${name}@${version}` : name,
  )

  if (version && packageAnalysisGateway.isExactVersionSpecifier(reference)) {
    return version
  }

  return (await packageAnalysisGateway.resolvePackage(reference)).version
}

function parseStringQueryParam(value: ParsedQuery[string]): string | undefined {
  return Object.prototype.toString.call(value) === '[object String]'
    ? String(value)
    : undefined
}

function parseVersionQueryParam(
  value: ParsedQuery[string],
): string | undefined {
  const version = parseStringQueryParam(value)?.trim()

  if (!version || version === 'null' || version === 'undefined') {
    return undefined
  }

  return version
}

async function getStatsImage(query: ParsedQuery, cache: StatsImageCache) {
  const parsedName = parseStringQueryParam(query.name)

  if (!parsedName) throw new Error('name query parameter is required')

  const rawTheme = parseStringQueryParam(query.theme)
  const theme = isThemeName(rawTheme) ? rawTheme : undefined
  const wide = query.wide === 'true'
  const version = parseVersionQueryParam(query.version)

  const resolvedVersion = await resolveImageVersion(parsedName, version)

  const cached = await cache.getPackageSize({
    name: parsedName,
    version: resolvedVersion,
  })

  if (cached.status !== 'hit') {
    throw new Error(
      `Missing cached package size for ${parsedName}@${resolvedVersion}`,
    )
  }

  const result: StatsImageResult = cached.value

  return { result, theme, wide }
}

export function createGenerateImgMiddleware(
  cache: StatsImageCache,
): Middleware {
  return async ctx => {
    const url = ctx.url.replace(/&amp;/g, '&')
    const { query } = queryString.parseUrl(url)

    try {
      const { result, theme, wide } = await getStatsImage(query, cache)

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
        asSendContext(ctx),
        'client/assets/public/android-chrome-192x192.png',
      )
    }
  }
}
