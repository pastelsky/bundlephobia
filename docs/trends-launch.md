# Trends launch plan

## Audience and promise

For developers choosing between JavaScript dependencies, Bundlephobia Trends
combines npm download history, repository star totals, and previously analyzed
bundle sizes with release timing. The promise is a clearer comparison, not a
ranking of package quality or security. Downloads include automation; repository
stars can be shared by multiple packages; size history is not necessarily complete.

## Reviewable launch sequence

1. Discovery foundation: an accurate canonical landing page, crawlable guide,
   starter comparisons, sitemap generation in the build, and contextual links
   from package results. Keep the existing chart experience intact.
2. Measurement: semantic events for accepted/failed data loads, metric coverage,
   filter intent, and confirmed sharing; production-domain filters and a launch
   scorecard. Keep page views separate from completed comparisons.
3. Search landing pages: a small curated set of useful comparison pages with
   distinct, normalized URLs, comparison-specific metadata, server-rendered
   explanations and data summaries, source/freshness labels, and social previews.
   Reuse existing data/cache policy; do not add unlimited package/filter pages or
   block the entire page on a cold three-year history request. Keep arbitrary
   metric/range/grouping states consolidated under their intended canonical.
4. Distribution: add a homepage entry point and a short announcement/demo after
   the above ships. Review the copy and destinations before posting externally.
   Start with existing Bundlephobia users rather than an undifferentiated launch.

## Ready-to-adapt announcement

“Choosing between npm packages? Bundlephobia Trends lets you compare downloads,
GitHub stars, and bundle size history, with package releases alongside the chart.
Start with react vs vue, add your own packages, and share the comparison.”

Use `/trends?packages=react~vs~vue` as the demo. A campaign link can add
`utm_source`, `utm_medium`, and `utm_campaign=bundlephobia_trends_launch`; those
parameters must not become separate canonical/indexable pages. Capture a real
chart from production after deployment, not invented download or star values.

## Launch gate and follow-up

Before announcement: verify the merged production build, robots/canonical/sitemap,
mobile and dark-mode layout, curated links, three-year history coverage, source
failure behavior, and semantic events in the production analytics project. Test
starter comparisons by their actual package names, including scoped packages.

Review the same seven- and twenty-eight-day windows after launch. Use
`docs/analytics.md` for production filters and metric definitions. Track reach,
useful comparisons, share rate, returning users, data coverage, and p95 loading
time; use Search Console for non-branded impressions/clicks. Exclude staff/tests
when possible and publish the limitations rather than calling browser IDs people.
Do not declare organic success from indexing alone or from rank on brand queries.
