# End-to-end tests

These tests run Chromium against Bundlephobia's optimized production build and
the real local Koa API. They do not intercept first-party API requests.

## Run the suite

```sh
yarn test:e2e
```

This builds the application before starting Playwright. Use `yarn test:e2e:ui`
for Playwright UI Mode. CI builds once, then uses `yarn test:e2e:run` to avoid a
duplicate build.

The package-analysis journeys use the exact package `is-number@7.0.0`. It is a
small, dependency-free fixture that exercises registry resolution,
installation, bundling, minification, and result rendering without placing a
large load on the build service.

## Structure

- `pages/` owns reusable locators and user actions. Prefer roles, labels, and
  visible text over CSS selectors or implementation details.
- `fixtures/test.ts` creates typed page objects on demand for each isolated
  browser context.
- `test-data/` contains immutable shared inputs, not mutable test state.
- `*.spec.ts` describes outcomes and keeps assertions close to the behavior
  being verified.

Use `test.step` inside page-object actions so reports and traces preserve the
user journey. Add a test ID only when a meaningful accessible locator cannot be
provided. Keep tests independent and wait on rendered outcomes with Playwright
assertions rather than fixed delays.

Mocking is reserved for a test that intentionally exercises a response the
local application cannot produce safely or deterministically. Such tests
should live separately from the no-mock production journeys and name that
boundary explicitly.
