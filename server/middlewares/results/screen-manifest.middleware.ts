import type { Middleware } from 'koa'
import { screenPackageManifest } from 'package-build-stats/preflight'

const screenManifestMiddleware: Middleware = async (ctx, next) => {
  if (ctx.query.force !== 'true' && ctx.state.packageManifest) {
    screenPackageManifest(ctx.state.packageManifest)
  }

  await next()
}

export default screenManifestMiddleware
