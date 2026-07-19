# Mobile critical-path browser evidence

Tested from the final stacked production build with a read-only cache fixture for `react@18.2.0` and browser mocks for optional APIs.

## Verified

- Production build completes without synchronous-script or Google Font warnings.
- Mobile cache-hit page hydrates without React mismatch errors at 390 x 844.
- Buffered local LCP entry: `708 ms` in the verification harness.
- Google Fonts resource requests: `0`.
- Document width: `390 px`; viewport width: `390 px`.
- Export analysis is absent from the initial request list.
- Scrolling the export section near the viewport triggers `/api/exports` and `/api/exports-sizes`, both returning HTTP 200 in the fixture.
- Dark mode remains usable at the mobile breakpoint.
- With reduced motion enabled, transition and animation duration compute to `0.00001s`.

## Artifacts

- `package-mobile-verified.png`: initial light-mode mobile package page.
- `package-dark-verified.png`: initial dark-mode mobile package page.
- `export-analysis-verified.png`: export results after scrolling near the section.
- `mobile-critical-path-final-verified.webm`: load, deferred export analysis, and theme flow.

The direct Next verification server does not serve Bundlephobia's Koa-managed favicon assets, accounting for the only two console errors. No React hydration errors or application request failures remain.
