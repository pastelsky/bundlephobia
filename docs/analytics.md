# Website analytics

Bundlephobia uses Umami for privacy-first website analytics.

## Collection

The tracker automatically records anonymous visitors, sessions, page views,
referrers, device context, and client-side navigation. It also collects Core Web
Vitals. It respects Do Not Track, runs only on Bundlephobia production domains,
and excludes URL query parameters.

Bundlephobia has no authenticated website accounts, so it does not call
`umami.identify()` or send a distinct ID. Umami's anonymous visitor and session
data is the appropriate user-level view for this website. Do not add email
addresses, IP addresses, or other personal information to event data.

## Custom events

`client/analytics.ts` is the only browser-event boundary. It records:

- package search attempts, outcomes, and durations;
- package export analysis and export-size outcomes;
- package.json scan upload, parsing, and completion outcomes;
- dependency graph interaction; and
- MCP navigation, tool, copy, and failure interactions.

Event names are lowercase snake_case. Event properties are limited to the
context required to analyze the action, such as a public package identifier,
duration, result ratio, count, or tool name.
