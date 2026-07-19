# Bundlephobia audit issues

Audited 2026-07-19 against the local development server and production build. Core surfaces covered: home/package search, package results, `package.json` scan, and scan results. Checks included desktop and 375px mobile layouts, keyboard/accessibility semantics, rapid navigation, back/forward behavior, loading/error paths, URL state, console/network behavior, production build output, lint, tests, and [React Doctor](https://github.com/millionco/react-doctor).

React Doctor reported 92 diagnostics across 40 files (3 errors, 89 warnings). The list below is deliberately curated to findings with runtime reproduction or direct source/build evidence.

## P1 — Stale search failures overwrite newer successful results

**Status:** Fixed in `032b3bcd`; superseded request successes and failures are ignored.

**Area:** Package search/results · routing/state

1. Start a package search whose `/api/size` request is slow and will fail.
2. Before it finishes, search for a valid package such as `react`.
3. Let the valid response finish, then let the first request fail.

**Actual:** The URL, title, and search field show `react@19.2.7`, but the page replaces its valid stats with the earlier package's error. This was reproduced with a delayed 500 response: the final URL was `/package/react@19.2.7` while the body showed the forced `AuditError`.

**Cause:** `ResultPage.fetchResults().catch(...)` updates state without confirming that `packageString === this.activeQuery`; the success path performs that guard. The history and similar-package error paths have the same stale-request risk.

**Expected:** Results from superseded searches must be ignored or aborted, including failures.

## P1 — Scan results are unusable on mobile

**Status:** Fixed in `9849a44f`; verified at 375px with no horizontal overflow.

**Area:** Scan results · responsive UI

Open `/scan-results?packages=react@18.2.0,lodash@4.17.21` at 375px width.

**Actual:** The fixed-width content is clipped with no usable horizontal scroll. Most size/time columns are outside the viewport, `Size: High → Low` is completely off-screen, and the page shows partial values at its right edge. DOM measurements placed the size-sort control at `left=452.7px` in a 375px viewport while `documentElement.scrollWidth` remained 375px.

**Expected:** Results should reflow into stacked cards or expose intentional horizontal scrolling with all controls and values reachable.

## P1 — API error HTML is inserted without sanitization

**Status:** Fixed in `812032b3`; error markup is restricted through DOMPurify.

**Area:** Package results/scan results · security

`ResultPage.tsx:515` inserts `errorBody` with `dangerouslySetInnerHTML`; `ScanResults.tsx:134` does the same with `pack.error.message`. Server error construction interpolates dynamic build values such as missing module names and minifier file paths into those strings without HTML escaping.

**Impact:** A malicious npm package can potentially place HTML-capable strings in build errors and execute markup/script in Bundlephobia's origin when a user analyzes it. React Doctor independently flagged both sinks.

**Expected:** Render errors as text, or sanitize/escape all dynamic fragments before allowing the small trusted formatting subset.

## P1 — Production dependency security baseline is failing

**Area:** Dependency/security health

React Doctor reported three high-priority dependency findings:

- `next@13.5.6` is on an unsupported release line affected by React Server Components security advisories, with no patched 13.x release.
- `axios@0.21.4` scored 25/100 on Socket's vulnerability axis.
- `koa@2.15.0` scored 25/100 on Socket's vulnerability axis.

**Expected:** Upgrade Next.js to a supported patched line and resolve/verify the Axios and Koa advisories before the next deployment.

## P1 — The test suite no longer matches package-build-stats behavior

**Area:** Development loop/regression protection

`yarn test --runInBand --no-watchman` fails 3 of 15 tests in `__tests__/errors-cache.test.ts`:

- The React 16.5.0 response fixture expects old sizes and omits newer fields such as `assets`, `peerDependencies`, and `isModuleType`.
- Two tests expect `Cache-Control: max-age=86400` but receive `max-age=30`.

**Impact:** CI cannot distinguish intentional package-builder/cache changes from real regressions.

**Expected:** Update fixtures only after confirming the new response and cache TTL are intentional; otherwise fix the underlying regression.

## P2 — Mobile header hides global actions

**Status:** Fixed in `cbcb6d4a`; controls wrap into a reachable second row at 375px.

**Area:** Package results/scan pages · navigation

At 375px, the non-minimal header keeps the logo, quick links, MCP, GitHub, and theme controls on one row while the page suppresses horizontal overflow.

**Actual:** GitHub (`left=405px`) and theme toggle (`left=437px`) are fully off-screen; MCP is only partially visible. They cannot be reached by touch or scrolling.

**Expected:** Collapse the header into a menu, wrap it, or prioritize essential actions at mobile widths.

## P2 — Scan permits a zero-package submission

**Status:** Fixed in `bca93587`; the action is disabled and an empty-selection message is shown.

**Area:** Package scan · validation/empty state

Upload a valid `package.json`, uncheck every package, and click `Scan 0 packages`.

**Actual:** The enabled button routes to `/scan-results?packages=` and shows a normal-looking Results page with zero-byte totals and active sort controls.

**Expected:** Disable the scan action until at least one package is selected and show a useful empty-state explanation.

## P2 — Browser Back discards the uploaded scan and selections

**Status:** Fixed in `2b6055a4`; parsed selections are restored from session storage.

**Area:** Package scan · navigation/state

Upload a `package.json`, choose packages, scan them, then use browser Back.

**Actual:** `/scan` returns to the initial upload dropzone; the parsed manifest and selections are gone, so users must upload the file again to adjust the scan.

**Expected:** Preserve the parsed scan state for Back navigation, or offer an explicit “Edit selection” path that restores it.

## P2 — Unsupported dependency specifications disappear silently

**Status:** Fixed in `c76c67f0`; skipped dependency names and counts are displayed.

**Area:** Package scan · data clarity

A manifest containing five dependencies—three semver ranges, one `workspace:*`, and one GitHub dependency—displayed only the three semver entries. There was no skipped-count, explanation, or warning.

**Impact:** Users can believe the full manifest was considered when dependencies were silently excluded.

**Expected:** List skipped dependencies with the unsupported specification reason, or show a clear summary such as “2 dependencies cannot be scanned.”

## P2 — Core icon-only controls have no accessible names

**Status:** Partially fixed in `cbf260f5`; icon controls have labels and suggestions expose listbox/option roles.

**Area:** Home/package results · accessibility

Runtime accessibility snapshots exposed the search submit button and npm package link as unnamed controls. React Doctor also flagged the search button plus npm/GitHub links in `QuickStatsBar` and repository controls in similar-package cards.

The autocomplete popup exposes suggestions as generic clickable `div` elements rather than a `listbox` with `option` semantics, so screen readers do not receive the same selection context as sighted users.

**Expected:** Add visible or `aria-label` names to icon-only controls and implement the standard combobox/listbox/option relationship.

## P2 — Scan routes pay unnecessary runtime SSR cost

**Status:** `/scan` fixed in `e20c7a0b`; `/scan-results` still needs query-state refactoring before removing `getInitialProps`.

**Area:** Performance/routing

The production build classifies both `/scan` and `/scan-results` as server-rendered routes:

- `/scan`: 9.33 kB route JS, 107 kB first load; forced SSR by an empty `getServerSideProps`.
- `/scan-results`: 13.4 kB route JS, 112 kB first load; forced SSR by an empty `getInitialProps`, which also emits a Next.js de-optimization warning in the browser.

Both pages are client-driven and do not fetch server data while rendering.

**Expected:** Statically optimize the scan page and initialize scan-result query state from the router after readiness (or use a narrowly justified server data path).

## P2 — React compatibility warnings are present in core loading/search UI

**Status:** `BuildProgressIndicator` fixed in `8564b8b3`; `react-autocomplete` migration remains.

**Area:** Correctness/maintainability

React Doctor reports `BuildProgressIndicator.componentWillReceiveProps` as an error because it is unsafe under concurrent rendering and removed in React 19. Every audited page with autocomplete also emitted React 18 warnings for `componentWillMount` and `componentWillReceiveProps` from the old `react-autocomplete` package; its declared peer range does not include React 18.

**Expected:** Replace the legacy lifecycle in `BuildProgressIndicator` and migrate away from the incompatible autocomplete dependency.

## P3 — Global font loading is render-blocking

**Area:** Page-load performance

The Google Fonts stylesheet in `_document.page.tsx` is marked `renderBlockingStatus: blocking` by the browser. Both lint and React Doctor also flag it; it lacks a `display` strategy. The document additionally loads three synchronous Sentry scripts, which lint flags on every build.

**Expected:** Self-host through `next/font` (or at least add an appropriate display strategy) and load monitoring scripts with an explicit non-blocking strategy.

## P3 — `/tree` and `/compare` look implemented but can never route

**Area:** Routing/dead code

`pages/tree/index.ts` and `pages/compare/index.ts` export full page components, but `next.config.js` accepts only `*.page.js` and `*.page.tsx`. Direct navigation to `/tree?p=react-dom` returns the Next.js 404, and neither feature is linked from the product. React Doctor reports the unreachable files as dead code.

**Expected:** Rename them to routable page files and expose intentional navigation, or remove the abandoned features and their styles/components.

## Verification summary

- `yarn build`: passed; warnings for font loading, three synchronous scripts, and an unoptimized blog image.
- `yarn lint`: passed with the same warnings.
- `yarn test --runInBand --no-watchman`: failed (3 tests failed, 12 passed).
- React Doctor: completed (3 errors, 89 warnings, 40 affected files).
