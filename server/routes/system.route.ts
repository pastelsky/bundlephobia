import Router from '@koa/router'
import invariant from 'ts-invariant'
import { parse } from 'url'
import type { Middleware } from 'koa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { UrlWithParsedQuery } from 'node:url'

import config from '../config'
import {
  buildApiCatalog,
  CATALOG_CONTENT_TYPE,
} from '../services/api-catalog.service'

type NextRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  parsedUrl: UrlWithParsedQuery,
) => Promise<void>

const apiCatalogRoute: Middleware = async ctx => {
  ctx.cacheControl = {
    maxAge: config.CACHE.PUBLIC_ASSETS,
  }
  // Set explicitly rather than via ctx.type, which would append a charset.
  ctx.set('Content-Type', CATALOG_CONTENT_TYPE)
  ctx.body = buildApiCatalog()
}

const resultRoute: Middleware = async ctx => {
  invariant(ctx.query.p, 'p parameter is required')

  const packageString = Array.isArray(ctx.query.p)
    ? ctx.query.p.join('/')
    : ctx.query.p

  ctx.redirect(`/package/${packageString.trim()}`)
  ctx.status = 301
}

function createNextCatchAllRoute(handle: NextRequestHandler): Middleware {
  return async ctx => {
    invariant(ctx.req.url, 'url is missing')
    const parsedUrl = parse(ctx.req.url, true)
    await handle(ctx.req, ctx.res, parsedUrl)
    ctx.respond = false
  }
}

export function registerSystemRoutes(
  router: Router,
  handle: NextRequestHandler,
): void {
  router.get('/.well-known/api-catalog', apiCatalogRoute)
  router.get('/result', resultRoute)
  router.get('(.*)', createNextCatchAllRoute(handle))
}
