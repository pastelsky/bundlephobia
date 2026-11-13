import { posix } from 'node:path'
import type { Middleware } from 'koa'

// HAProxy authenticates the canonical /stats prefix. koa-static decodes and
// resolves paths later, so aliases must not become private files after that check.
const statsPathMiddleware: Middleware = async (ctx, next) => {
  let decodedPath: string

  try {
    decodedPath = decodeURIComponent(ctx.path)
  } catch {
    return ctx.throw(400, 'Malformed request path')
  }

  const canonicalPath = posix.normalize(decodedPath)

  const isStats =
    canonicalPath === '/stats' || canonicalPath.startsWith('/stats/')

  if (isStats && ctx.path !== canonicalPath) {
    ctx.throw(400, 'Non-canonical stats path')
  }

  await next()
}

export default statsPathMiddleware
