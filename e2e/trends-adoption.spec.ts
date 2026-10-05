import { gunzipSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'

type AnalyticsEvent = {
  event_type: string
  event_properties: {
    page_type?: string
    page_domain?: string
    environment?: string
    packageCount?: number
    selection?: string
    enabled?: boolean
    metric?: string
    groupBy?: string
    range?: string
    warningPackageCount?: number
    sizePackageCount?: number
    starsPackageCount?: number
    downloadPackageCount?: number
    timeTaken?: number
  }
}

async function captureEvents(page: Page) {
  const events: AnalyticsEvent[] = []
  await page.route('**/_events', async route => {
    const body = route.request().postDataBuffer()

    if (body) {
      const decoded =
        body[0] === 31 && body[1] === 139 ? gunzipSync(body) : body

      // SAFETY: this envelope is produced by the bundled Amplitude SDK,
      // the external ingestion boundary under test.
      const batch = JSON.parse(decoded.toString()) as {
        events: AnalyticsEvent[]
      }

      events.push(...batch.events)
    }

    await route.fulfill({ status: 200, json: { code: 200 } })
  })
  await page.route('**/api/similar-packages?*', route =>
    route.fulfill({ json: { category: '', similar: [] } }),
  )

  return events
}

test('reports partial data, selections and confirmed sharing without reloading data', async ({
  page,
  context,
}) => {
  const events = await captureEvents(page)
  await page.route('**/api/trends?*', async route => {
    const query = new URL(route.request().url()).searchParams
    await route.fulfill({
      json: {
        range: query.get('range'),
        generatedAt: '2026-10-01T00:00:00Z',
        packages: (query.get('packages') ?? '').split(',').map(name => ({
          name,
          repository: null,
          downloads: [
            { date: '2026-09-01', value: 100 },
            { date: '2026-09-02', value: 120 },
          ],
          stars: [],
          size: [],
          releases: [],
          current: {
            weeklyDownloads: 220,
            stars: null,
            size: null,
            gzip: null,
          },
          warnings: ['GitHub star history is unavailable'],
        })),
      },
    })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/trends')

  const loaded = () =>
    events.filter(event => event.event_type === 'trends_data_loaded')

  await expect.poll(() => loaded().length).toBe(1)
  expect(loaded()[0].event_properties).toMatchObject({
    packageCount: 2,
    range: 'last-year',
    downloadPackageCount: 2,
    starsPackageCount: 0,
    sizePackageCount: 0,
    warningPackageCount: 2,
    page_domain: '127.0.0.1',
    environment: process.env.E2E_ENVIRONMENT ?? 'production',
  })
  expect(loaded()[0].event_properties.timeTaken).toBeGreaterThanOrEqual(0)
  await page.getByRole('button', { name: 'Stars', exact: true }).click()
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await page.getByRole('button', { name: 'Copy link', exact: true }).click()
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'trends_link_copied')
          .length,
    )
    .toBe(1)
  expect(
    events.find(event => event.event_type === 'trends_link_copied')
      ?.event_properties,
  ).toMatchObject({
    packageCount: 2,
    metric: 'stars',
    groupBy: 'month',
    range: 'last-year',
  })
  expect(
    events
      .filter(event => event.event_type === 'trends_selection_changed')
      .map(event => event.event_properties.selection),
  ).toEqual(['metric', 'group_by'])
  expect(loaded()).toHaveLength(1)
  expect(
    events.filter(
      event =>
        event.event_type === 'page_context_viewed' &&
        event.event_properties.page_type === 'trends',
    ),
  ).toHaveLength(1)
  await page.getByRole('checkbox', { name: 'Major version' }).uncheck()
  await page.getByRole('checkbox', { name: 'Minor version' }).check()
  await expect
    .poll(() =>
      events
        .filter(event => event.event_type === 'trends_selection_changed')
        .map(event => ({
          selection: event.event_properties.selection,
          enabled: event.event_properties.enabled,
        })),
    )
    .toEqual([
      { selection: 'metric', enabled: undefined },
      { selection: 'group_by', enabled: undefined },
      { selection: 'major_releases', enabled: false },
      { selection: 'minor_releases', enabled: true },
    ])
  expect(loaded()).toHaveLength(1)
})

test('a failed request records failure rather than data acceptance', async ({
  page,
}) => {
  const events = await captureEvents(page)
  await page.route('**/api/trends?*', route =>
    route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
  )
  await page.goto('/trends')
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'trends_data_failed')
          .length,
    )
    .toBe(1)
  expect(
    events.filter(event => event.event_type === 'trends_data_loaded'),
  ).toHaveLength(0)
})

test('a superseded request does not inflate the accepted-load count', async ({
  page,
}) => {
  const events = await captureEvents(page)
  let releaseFirst: () => void = () => undefined

  const firstRequest = new Promise<void>(resolve => {
    releaseFirst = resolve
  })

  let receivedFirst = false
  await page.route('**/api/trends?*', async route => {
    const range = new URL(route.request().url()).searchParams.get('range')

    if (range === 'last-year') {
      receivedFirst = true
      await firstRequest
    }

    await route.fulfill({
      json: { range, generatedAt: '2026-10-01T00:00:00Z', packages: [] },
    })
  })
  await page.goto('/trends')
  await expect.poll(() => receivedFirst).toBe(true)
  await page.getByRole('button', { name: '3Y', exact: true }).click()
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'trends_data_loaded')
          .length,
    )
    .toBe(1)
  releaseFirst()
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await expect
    .poll(
      () =>
        events.filter(event => event.event_type === 'trends_selection_changed')
          .length,
    )
    .toBe(2)
  expect(
    events.filter(event => event.event_type === 'trends_data_loaded'),
  ).toHaveLength(1)
  expect(
    events.find(event => event.event_type === 'trends_data_loaded')
      ?.event_properties.range,
  ).toBe('last-3-years')
})
