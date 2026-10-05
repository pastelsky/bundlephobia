# Website analytics

Analytics helps assess discovery, useful comparisons, sharing, and reliability.
Reports should describe user-visible outcomes, not assume that a page view or
successful HTTP response means the feature worked.

## Collection principles

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
