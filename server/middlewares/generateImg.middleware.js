const { drawStatsImg } = require('../../utils/draw.utils')
const Cache = require('../../utils/cache.utils')
const send = require('koa-send')
const path = require('path')
const queryString = require('query-string')
const { resolvePackage } = require('../../utils/server.utils')
const semver = require('semver')

const cache = new Cache()

async function generateImgMiddleware(ctx, next) {
  // See https://github.com/facebook/react/issues/13838
  const url = ctx.url.replace(/&amp;/g, '&')

  let { name, version, theme, wide } = queryString.parseUrl(url).query

  try {
    if (!semver.valid(version)) {
      const resolved = await resolvePackage(name)
      version = resolved.version
    }

    const result = await cache.getPackageSize({ name, version })

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
  } catch (err) {
    console.error(err)
    ctx.cacheControl = {
      noCache: true,
    }
    await send(ctx, 'client/assets/public/android-chrome-192x192.png')
  }
}

module.exports = generateImgMiddleware
