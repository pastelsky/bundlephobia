# Curated discovery browser evidence

Tested from the isolated stacked PR commit.

## Verified

- Production build and sitemap generation complete successfully.
- All six comparison routes return HTTP 200.
- All six category routes return HTTP 200.
- Unknown comparison slugs return HTTP 404.
- Comparison navigation, browser back/forward, deep-link refresh, and related links preserve canonical route state.
- The state-management category renders five semantic table rows and three related links.
- Mobile comparison and category pages have no horizontal overflow at 390 px.
- `sitemap.xml` and all three shards return HTTP 200 and pass `xmllint`.
- The guides shard contains all 12 curated comparison/category URLs.

## Artifacts

- `compare-index.png`: desktop comparison directory.
- `compare-detail-mobile.png`: mobile comparison detail.
- `category-mobile.png`: mobile category detail.
- `discovery-flow.webm`: index-to-comparison and category flow.

The local environment blocks `registry.npmjs.org`, so uncached table rows intentionally show the safe `Not cached` fallback. Production reads existing Bundlephobia analyses through the cache service without triggering builds from these pages.
