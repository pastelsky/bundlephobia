# Cache-first package HTML evidence

Tested from the isolated PR commit with a read-only cache-service fixture for `react@18.2.0`.

## Verified

- Initial HTML title: `react bundle size: 2.6 kB gzip | Bundlephobia`
- Initial description includes `6.6 kB minified` and `2.6 kB with gzip`
- Canonical URL: `https://bundlephobia.com/package/react`
- Initial HTML contains the rendered package facts.
- Browser hydration makes no `/api/size` request on a cache hit.
- The 390 px viewport has no horizontal document overflow.

## Artifacts

- `cache-hit-stats.png`: focused mobile bundle and download facts.
- `cache-hit-flow-clean.webm`: cache-hit page load at 390 x 600.

The direct Next.js verification server does not include Bundlephobia's Koa API/static layer, so its favicon and optional history/export requests return 404. Those responses are unrelated to the cache-hit SSR path and `/api/size` is absent from the request list.
