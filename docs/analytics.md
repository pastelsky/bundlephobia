# Website analytics

Analytics helps assess discovery, useful comparisons, sharing, and reliability.
Reports should describe user-visible outcomes, not assume that a page view or
successful HTTP response means the feature worked.

## Collection principles

- Website tracking runs only on production Bundlephobia hosts. Custom events
  include a tracking version so instrumentation changes can be separated from
  changes in usage. Automatic page/session events are separate from custom
  events; generic form and element interaction collection is disabled.
- Keep event data limited to the context needed to understand an action.
- Trends-specific measurements use package counts and filter selections, not
  package names, search input, clipboard contents, or arbitrary error text.
- Do not add emails, IP addresses, or other personal information to custom events.
- Browser SDK collection has a separate scope; the limits above are not a claim
  that all automatically collected data follows the same restrictions.

## Trends measurement

Use consistent production-only filters and date windows. Exclude local builds,
test traffic, and staff activity where they can be identified.

- Reach: the share of website visitors who open Trends.
- Useful comparisons: at least two packages have data for the metric being
  evaluated. Report missing or partial coverage separately.
- Intent: package and filter changes, distinguished from release-overlay changes.
- Sharing: successful link copies, not just clicks on the copy button.
- Reliability: loading failures, warnings, metric coverage, and loading latency.
  Loading latency is not chart-rendering or animation performance.
- Return use: repeat use of useful comparisons over time.

## Interpretation limits

Browser identities are not people. Bots, blocked analytics, identity resets,
and incomplete staff/test exclusion can affect results. Keep page views,
visitors, sessions, and completed comparisons distinct, and state which one a
report measures.

Use acquisition reports and search performance to understand discovery; data-load
outcomes alone cannot explain where visitors came from. Historical reports may
lack newly introduced measurements, so compare periods with compatible coverage.

## Package journeys

Search submissions represent deliberate input, not opening a result page or
selecting a historical version. Package loading and its outcomes identify the
source: initial page load, navigation, search, history, or manifest scan.
Retrieved results and displayed results are separate observations. Search
success/failure events retain their historical names, but should not be compared
with search submissions without accounting for source and tracking version.

Trends comparison views describe the selected metric's displayed data coverage,
including selections that show no data. A useful comparison needs at least two
packages with data; a successful fetch alone does not establish this.

## Advertising diagnostics

Ad requests, loaded creatives, load failures, and viewability are separate
observations. Viewability means at least half of the ad was in the viewport for
one continuous second while the document was visible. Script errors and creative
timeouts do not establish whether a blocker, lack of demand, or a network failure
was responsible. These browser diagnostics are not billable impressions or
earnings; publisher reports remain authoritative for revenue.
