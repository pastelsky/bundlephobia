# Website analytics

The deployed website uses Amplitude (`client/amplitude.ts`). Browser events go
through `/_events`; HAProxy forwards that endpoint to Amplitude. Autocapture
provides page views and browser interactions. `client/analytics.ts` owns semantic
events for package searches, scans, exports, MCP, and trends.

## Collection

Custom events include `page_domain` and `environment`. For production reports,
filter `page_domain = bundlephobia.com` (or explicitly include an approved alias)
and `environment = production`. A local production build is still localhost and
must not be counted as production adoption. Autocaptured events use Amplitude's
own Page Domain property instead. These new custom-event properties are not
backfilled onto historical events.

Do not send emails, IP addresses, arbitrary errors, clipboard contents, or search
input to trends semantic events. Trends events record counts and enumerated filter
values, not package names or URLs. Autocapture is a separate SDK facility; these
constraints are not a claim that it collects the same limited set of properties.

## Custom events

`client/analytics.ts` is the only browser-event boundary. It records:

- package search attempts, outcomes, and durations;
- package export analysis and export-size outcomes;
- package.json scan upload, parsing, and completion outcomes;
- dependency graph interaction; and
- MCP navigation, tool, copy, and failure interactions; and
- trends data-load outcomes, selection changes, and confirmed sharing.

Event names are lowercase snake_case. Event properties are limited to the
context required to analyze the action, such as a public package identifier,
duration, result ratio, count, or tool name.

An unavailable ad is recorded only after its otherwise invisible slot reaches
the viewport. Its reason is either `script_error` or `creative_timeout`; these
signals cover ad blockers and no-fill/network failures, but do not attempt to
identify which one caused the missing creative.

## Trends measurement

| Event                                       | Meaning                                                                | Properties beyond domain/environment                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `page_context_viewed`, `page_type = trends` | The trends page mounted, not each filter change                        | `page_type`                                                                                                                  |
| `trends_data_loaded`                        | The active request resolved and its response was accepted by the page  | `packageCount`, `range`, `timeTaken`, `downloadPackageCount`, `starsPackageCount`, `sizePackageCount`, `warningPackageCount` |
| `trends_data_failed`                        | The active data request failed                                         | `packageCount`, `range`, `timeTaken`                                                                                         |
| `trends_selection_changed`                  | A user changed packages, metric, range, grouping, or a release overlay | `selection`, `packageCount`, `metric`, `range`, `groupBy`, and `enabled` for overlays                                        |
| `trends_link_copied`                        | The browser confirmed a successful clipboard write                     | `packageCount`, `metric`, `range`, `groupBy`                                                                                 |
| `trends_link_copy_failed`                   | The clipboard write failed                                             | Same selection context; no error text or clipboard contents                                                                  |

`timeTaken` is milliseconds measured in the browser, including network and
client/API caching. Superseded requests and responses after unmount do not emit
load outcomes. The load event is **not** a paint/animation-completed event, and a
200 response is not proof that every metric has data. Use the per-metric package
counts and `warningPackageCount` to distinguish useful data from partial results.
An empty selection makes no data request and records no load success.

## Launch scorecard in Amplitude

Use the same production filters and date window for numerator and denominator:

1. Reach: unique users with `page_context_viewed`, `page_type = trends`, divided
   by unique users with any `page_context_viewed`.
2. Useful comparisons: unique users with `trends_data_loaded`, `packageCount >= 2`
   and at least two packages with data for the metric being evaluated. Report
   missing-metric coverage separately; do not equate an HTTP 200 with a useful chart.
3. Intent: users with non-overlay `trends_selection_changed`; report the chosen
   metric/range/grouping and package-count distribution.
4. Sharing: users with `trends_link_copied`, not just clicks on the Copy link button.
5. Reliability: failed versus accepted data requests, warning rates, per-metric
   coverage, and p50/p95 `timeTaken`. These measure data loading, not chart rendering.
6. Return use: weekly user retention on useful comparisons.

Use Amplitude's session definition for session reports. Browser identities are
not people; staff/tests, bots, ad blockers, and identity resets remain caveats.
Generic page-view totals can include client-side navigations, so do not call them
visits or completed comparisons. Acquisition belongs in page-view referrer/UTM
reports and Search Console, not inferred from semantic load events.
