import type { Context, Next } from 'koa'

const CATALOG_PATH = '/.well-known/api-catalog'

const OPENAPI_PATH = '/openapi.json'

const DOCS_URL = 'https://github.com/pastelsky/bundlephobia#readme'

const OPENAPI_TYPE = 'application/openapi+json'

/**
 * Sets discovery headers before the catch-all hands the response to Next,
 * which writes to `ctx.res` directly and would otherwise flush headers first.
 */
export async function apiDiscoveryMiddleware(ctx: Context, next: Next) {
  if (ctx.path === '/') {
    ctx.set(
      'Link',
      [
        `<${CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"`,
        `<${OPENAPI_PATH}>; rel="service-desc"; type="${OPENAPI_TYPE}"`,
        `<${DOCS_URL}>; rel="service-doc"; type="text/html"`,
      ].join(', '),
    )
  }

  await next()
}
