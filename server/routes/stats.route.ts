import type Router from '@koa/router'
import type { Middleware } from 'koa'

import {
  proxyStatsRequest,
  redirectStatsRequest,
} from '../services/victoriametrics.service'

const statsRoute: Middleware = async ctx => {
  const redirect = redirectStatsRequest(ctx.path)

  if (redirect) {
    ctx.redirect(redirect)

    return
  }

  ctx.respond = false
  await proxyStatsRequest(ctx.req, ctx.res)
}

export function registerStatsRoutes(router: Router): void {
  router.all('/stats', statsRoute)
  router.all('/stats/(.*)', statsRoute)
}
