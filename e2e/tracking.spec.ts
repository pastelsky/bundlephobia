import { gunzipSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import type { TrendsResponse } from '@bundlephobia/service-contracts/trends'
import { expect, test } from './fixtures/test'

type TrackedEvent = {
  event_type: string
  event_properties?: {
    source?: string
    tracking_version?: number
    placement?: string
    reason?: string
    metric?: string
    dataPackageCount?: number
  }
}

async function captureTracking(page: Page, baseURL: string, belowFold = false) {
  const events: TrackedEvent[] = []

  // Exercise the real production-only SDK without sending telemetry or builds
  // to production: application resources come from the local production build.
  await page.route('https://bundlephobia.com/**', async route => {
    const url = new URL(route.request().url())

    await route.fulfill({
      response: await route.fetch({
        url: `${baseURL}${url.pathname}${url.search}`,
      }),
    })
  })
  await page.route('**/_events', async route => {
    const data = route.request().postDataBuffer()

    if (data) {
      const json =
        data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data

      // SAFETY: this is the actual SDK's event envelope intercepted by the test.
      const payload = JSON.parse(json.toString()) as { events: TrackedEvent[] }

      events.push(...payload.events)
    }

    await route.fulfill({ json: { code: 200 } })
  })
  await page.route('**/api/size?*', route =>
    route.fulfill({
      json: {
        name: 'is-number',
        version: '7.0.0',
        description: 'Tracking fixture',
        repository: 'https://github.com/jonschlinkert/is-number',
        size: 600,
        gzip: 300,
        dependencyCount: 0,
        hasSideEffects: false,
        hasJSModule: false,
        hasJSNext: false,
        isModuleType: false,
      },
    }),
  )
  await page.route('**/api/package-history?*', route =>
    route.fulfill({
      json: {
        package: 'is-number',
        versions: [],
      },
    }),
  )
  await page.route('**/api/similar-packages?*', route =>
    route.fulfill({
      json: {
        category: { score: 0, similar: [] },
      },
    }),
  )
  await page.route('**/api/recent?*', route => route.fulfill({ json: {} }))
  await page.route('**/api.npms.io/**', route => route.fulfill({ json: [] }))
  await page.route('**/cdn.carbonads.com/**', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const ad = document.createElement('div');
      ad.id = 'carbonads';
      ad.style.cssText = 'width:300px;height:100px;background:#eee;padding:12px;margin-top:${belowFold ? 1000 : 0}px';
      ad.innerHTML = '<a href="#"><img alt="Ad fixture" width="30" height="30" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=" />Browser-test ad fixture</a>';
      document.getElementById('_carbonads_js').parentElement.appendChild(ad);`,
    }),
  )

  return events
}

test('counts one deliberate search and distinguishes retrieval from displayed results', async ({
  page,
  baseURL,
}) => {
  const events = await captureTracking(page, baseURL!)
  await page.goto('https://bundlephobia.com/')
  const search = page.getByRole('combobox').first()
  await search.fill('is-number@7.0.0')
  await search.press('Enter')
  await expect(page.getByText('Minified + Gzipped')).toBeVisible()
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'package_result_viewed')
          .length,
    )
    .toBe(1)
  expect(
    events.filter(event => event.event_type === 'search_performed'),
  ).toHaveLength(1)
  expect(
    events.find(event => event.event_type === 'search_performed')
      ?.event_properties,
  ).toMatchObject({ source: 'home', tracking_version: 2 })
  expect(
    events.find(event => event.event_type === 'search_succeeded')
      ?.event_properties,
  ).toMatchObject({ source: 'page_load' })

  if (!process.env.CI) {
    await page.screenshot({
      path: 'docs/screenshots/tracking-quality.png',
      fullPage: true,
    })
  }

  await page.reload()
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'package_result_viewed')
          .length,
    )
    .toBe(2)
  expect(
    events.filter(event => event.event_type === 'search_performed'),
  ).toHaveLength(1)
})

test('records creative loading separately from continuous viewport visibility', async ({
  page,
  baseURL,
}) => {
  const events = await captureTracking(page, baseURL!, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('https://bundlephobia.com/')
  await expect
    .poll(() => events.filter(event => event.event_type === 'ad_loaded').length)
    .toBe(1)
  expect(
    events.filter(event => event.event_type === 'ad_viewable'),
  ).toHaveLength(0)
  await page.locator('#carbonads').scrollIntoViewIfNeeded()
  await expect
    .poll(
      () => events.filter(event => event.event_type === 'ad_viewable').length,
    )
    .toBe(1)
  expect(
    events.find(event => event.event_type === 'ad_viewable')?.event_properties,
  ).toMatchObject({ placement: 'home' })
})

test('records a failed ad script without inventing a viewable impression', async ({
  page,
  baseURL,
}) => {
  const events = await captureTracking(page, baseURL!)
  await page.route('**/cdn.carbonads.com/**', route => route.abort('failed'))
  await page.goto('https://bundlephobia.com/')
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'ad_load_failed').length,
    )
    .toBe(1)
  expect(
    events.find(event => event.event_type === 'ad_load_failed')
      ?.event_properties,
  ).toMatchObject({ reason: 'script_error' })
  expect(
    events.filter(event =>
      ['ad_loaded', 'ad_viewable'].includes(event.event_type),
    ),
  ).toHaveLength(0)
})

test('measures displayed trends coverage, not just a successful fetch', async ({
  page,
  baseURL,
}) => {
  const events = await captureTracking(page, baseURL!)

  const response: TrendsResponse = {
    range: 'last-year',
    generatedAt: new Date().toISOString(),
    packages: ['react', 'vue'].map(name => ({
      name,
      repository: null,
      downloads: [{ date: '2026-10-01', value: 100 }],
      stars: [],
      size: [],
      releases: [],
      current: { weeklyDownloads: 100, stars: 0, size: 0, gzip: 0 },
      warnings: [],
    })),
  }

  await page.route('**/api/trends?*', route =>
    route.fulfill({ json: response }),
  )
  await page.goto(
    'https://bundlephobia.com/trends?packages=react~vs~vue&metric=downloads&range=last-year&groupBy=day',
  )
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'trends_comparison_viewed')
          .length,
    )
    .toBe(1)
  expect(
    events.find(event => event.event_type === 'trends_comparison_viewed')
      ?.event_properties,
  ).toMatchObject({ metric: 'downloads', dataPackageCount: 2 })
  await page.getByRole('button', { name: 'Stars', exact: true }).click()
  await expect(
    page.getByText('No stars data points are available.'),
  ).toBeVisible()
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'trends_comparison_viewed')
          .length,
    )
    .toBe(2)
  expect(
    events.filter(event => event.event_type === 'trends_comparison_viewed')[1]
      .event_properties,
  ).toMatchObject({ metric: 'stars', dataPackageCount: 0 })
})
