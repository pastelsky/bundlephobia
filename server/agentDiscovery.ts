import { Context, Next } from 'koa'

/**
 * Machine-readable discovery for automated API consumers.
 *
 * Two related pieces:
 *   - an API catalog at /.well-known/api-catalog (RFC 9727), listing every
 *     public read API and linking each to the OpenAPI description
 *   - `Link` response headers (RFC 8288) on the homepage, so a client that
 *     fetches only `/` still finds the catalog without guessing at paths
 *
 * Only the public read APIs belong here. The /admin routes are credentialed
 * and the /api/mcp/* routes proxy an upstream MCP server for our own UI, so
 * neither is something we want to advertise.
 */

/**
 * Canonical origin, matching the hardcoded host in robots.txt and sitemap.xml.
 * Deliberately not derived from the request: behind Cloudflare, `ctx.origin`
 * reports the internal scheme unless Koa is configured to trust the proxy, and
 * a catalog that advertises `http://` anchors is worse than no catalog.
 */
const ORIGIN = 'https://bundlephobia.com'

const CATALOG_PATH = '/.well-known/api-catalog'
const OPENAPI_PATH = '/openapi.json'
const DOCS_URL = 'https://github.com/pastelsky/bundlephobia#readme'

const OPENAPI_TYPE = 'application/openapi+json'

/** RFC 9727 §3 requires the profile parameter alongside the linkset media type. */
export const CATALOG_CONTENT_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'

const PUBLIC_APIS = [
  { path: '/api/size', title: 'Minified and gzipped size of an npm package' },
  { path: '/api/exports', title: 'Named exports of an npm package' },
  { path: '/api/exports-sizes', title: 'Size of each named export' },
  {
    path: '/api/package-history',
    title: 'Package versions, publish dates, and bundle sizes',
  },
  {
    path: '/api/similar-packages',
    title: 'Packages similar to a given package',
  },
  { path: '/api/recent', title: 'Recently looked up packages' },
]

/**
 * Builds the linkset document.
 *
 * RFC 9727 Appendix A shows two shapes, and this emits both: one context
 * object anchored at the catalog with an `item` link per API, then one anchored
 * at each API carrying its `service-desc` and `service-doc`. Clients that walk
 * `item` links and clients that read per-API anchors both find what they need.
 *
 * No `status` relation — there is no health endpoint to point at, and inventing
 * one that always returns 200 would be worse than omitting the link.
 */
export function buildApiCatalog() {
  return {
    linkset: [
      {
        anchor: `${ORIGIN}${CATALOG_PATH}`,
        item: PUBLIC_APIS.map(api => ({
          href: `${ORIGIN}${api.path}`,
          title: api.title,
        })),
      },
      ...PUBLIC_APIS.map(api => ({
        anchor: `${ORIGIN}${api.path}`,
        'service-desc': [
          { href: `${ORIGIN}${OPENAPI_PATH}`, type: OPENAPI_TYPE },
        ],
        'service-doc': [{ href: DOCS_URL, type: 'text/html' }],
      })),
    ],
  }
}

/**
 * Relative-reference targets resolve against the request URI per RFC 8288 §3,
 * which keeps these correct in local development too.
 */
const HOMEPAGE_LINK_HEADER = [
  `<${CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"`,
  `<${OPENAPI_PATH}>; rel="service-desc"; type="${OPENAPI_TYPE}"`,
  `<${DOCS_URL}>; rel="service-doc"; type="text/html"`,
].join(', ')

/**
 * Sets the header before the catch-all hands the response to Next, which writes
 * to `ctx.res` directly and would otherwise flush headers first.
 */
export async function linkHeaderMiddleware(ctx: Context, next: Next) {
  if (ctx.path === '/') {
    ctx.set('Link', HOMEPAGE_LINK_HEADER)
  }

  await next()
}
