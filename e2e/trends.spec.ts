import { expect, test } from './fixtures/test'
import type { Page } from '@playwright/test'
import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'

const trendsResponse = {
  range: 'last-year',
  groupBy: 'week',
  generatedAt: '2026-09-20T00:00:00.000Z',
  packages: [
    {
      name: 'react',
      repository: 'facebook/react',
      downloads: [
        { date: '2026-08-24', value: 1_250_000 },
        { date: '2026-08-31', value: 1_310_000 },
        { date: '2026-09-07', value: 1_390_000 },
        { date: '2026-09-14', value: 1_440_000 },
      ],
      stars: [],
      size: [],
      releases: [],
      current: {
        weeklyDownloads: 1_440_000,
        stars: 241_000,
        size: 0,
        gzip: 6_100,
      },
      warnings: [],
    },
    {
      name: 'vue',
      repository: 'vuejs/core',
      downloads: [
        { date: '2026-08-24', value: 930_000 },
        { date: '2026-08-31', value: 980_000 },
        { date: '2026-09-07', value: 1_020_000 },
        { date: '2026-09-14', value: 1_060_000 },
      ],
      stars: [],
      size: [],
      releases: [],
      current: {
        weeklyDownloads: 1_060_000,
        stars: 210_000,
        size: 0,
        gzip: 7_200,
      },
      warnings: [],
    },
  ],
} satisfies TrendsResponse

test('renders package trends and chart controls', async ({ page }) => {
  await page.route(
    '**/api/trends?*',
    route =>
      new Promise(resolve =>
        setTimeout(
          () =>
            resolve(
              route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(trendsResponse),
              }),
            ),
          3_000,
        ),
      ),
  )

  await page.goto(
    '/trends?packages=react,vue&metric=downloads&range=last-year&groupBy=week',
  )

  await expect(page.getByText('[ ANALYZING PACKAGE TRENDS ]')).toBeVisible({
    timeout: 5_000,
  })
  await expect(
    page.getByRole('heading', { name: 'Package trends' }),
  ).toBeVisible()
  await expect(page.getByText('1.44', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'downloads trends chart' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Downloads', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('[ ANALYZING PACKAGE TRENDS ]')).toBeHidden()
  await expect
    .poll(async () => {
      const width = await page
        .locator('[data-series-clip]')
        .first()
        .getAttribute('width')

      return Number(width)
    })
    .toBeGreaterThan(1_000)

  await page.screenshot({
    path: 'artifacts/trends-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/trends-mobile.png', fullPage: true })
})

const rangeLabels: Record<TrendsRange, string> = {
  'last-2-months': '2M',
  'last-year': '1Y',
  'last-3-years': '3Y',
}

const groupLabels: Record<TrendsGroupBy, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
}

const metricLabels: Record<TrendsMetric, string> = {
  downloads: 'Downloads',
  stars: 'Stars',
  size: 'Size',
}

const pointCounts: Record<TrendsGroupBy, Record<TrendsMetric, number>> = {
  day: { downloads: 2, stars: 3, size: 4 },
  week: { downloads: 5, stars: 6, size: 7 },
  month: { downloads: 1, stars: 2, size: 3 },
}

const groupDates: Record<TrendsGroupBy, string[]> = {
  day: ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'],
  week: [
    '2026-08-10',
    '2026-08-17',
    '2026-08-24',
    '2026-08-31',
    '2026-09-07',
    '2026-09-14',
    '2026-09-21',
  ],
  month: ['2026-07-01', '2026-08-01', '2026-09-01'],
}

const ranges: TrendsRange[] = ['last-2-months', 'last-year', 'last-3-years']

const groups: TrendsGroupBy[] = ['day', 'week', 'month']

const metrics: TrendsMetric[] = ['downloads', 'stars', 'size']

const responseDelays: Record<TrendsGroupBy, number> = {
  day: 20,
  week: 60,
  month: 140,
}

function parseRange(value: string | null): TrendsRange {
  if (
    value === 'last-2-months' ||
    value === 'last-year' ||
    value === 'last-3-years'
  )
    return value

  throw new Error(`Unexpected trends range: ${value}`)
}

function parseGroupBy(value: string | null): TrendsGroupBy {
  if (value === 'day' || value === 'week' || value === 'month') return value

  throw new Error(`Unexpected trends grouping: ${value}`)
}

function permutationResponse(
  range: TrendsRange,
  groupBy: TrendsGroupBy,
): TrendsResponse {
  const responseCode =
    (ranges.indexOf(range) + 1) * 100 + groups.indexOf(groupBy)

  const points = (metric: TrendsMetric, packageIndex: number) =>
    groupDates[groupBy]
      .slice(0, pointCounts[groupBy][metric])
      .map((date, index) => ({
        date,
        value: (packageIndex + 1) * 100 + index * 10,
        version: metric === 'size' ? `1.${index}.0` : undefined,
      }))

  return {
    range,
    groupBy,
    generatedAt: '2026-09-20T00:00:00.000Z',
    packages: ['react', 'vue'].map((name, packageIndex) => ({
      name,
      repository: name === 'react' ? 'facebook/react' : 'vuejs/core',
      downloads: points('downloads', packageIndex),
      stars: points('stars', packageIndex),
      size: points('size', packageIndex),
      releases: [],
      current: {
        weeklyDownloads: responseCode + packageIndex,
        stars: 100 + packageIndex,
        size: 20_000 + packageIndex,
        gzip: 10_000 + packageIndex,
      },
      warnings: [],
    })),
  }
}

async function selectControl(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true })

  if ((await button.getAttribute('aria-pressed')) !== 'true')
    await button.click()
}

async function assertMetric(
  page: Page,
  metric: TrendsMetric,
  groupBy: TrendsGroupBy,
): Promise<void> {
  const metricButton = page.getByRole('button', {
    name: metricLabels[metric],
    exact: true,
  })

  await selectControl(page, metricLabels[metric])
  await expect(metricButton).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('img', { name: `${metric} trends chart` }),
  ).toBeVisible()
  await expect
    .poll(() => page.locator('[data-series-dot]').count())
    .toBe(pointCounts[groupBy][metric] * 2)
  await expect(
    page.locator(
      '.trends-chart__svg [d*="NaN"], .trends-chart__svg [cx="NaN"], .trends-chart__svg [cy="NaN"]',
    ),
  ).toHaveCount(0)
}

async function expectSeriesFullyRevealed(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const svgWidth = await page
        .locator('.trends-chart__svg')
        .evaluate(svg => svg.viewBox.baseVal.width)

      const clipWidths = await page
        .locator('[data-series-clip]')
        .evaluateAll(clips =>
          clips.map(clip => Number(clip.getAttribute('width'))),
        )

      return (
        clipWidths.length > 0 &&
        clipWidths.every(width => Math.abs(width - svgWidth) < 1)
      )
    })
    .toBe(true)
}

test('keeps every metric, range, and grouping permutation consistent', async ({
  page,
}) => {
  await page.route('**/api/trends?*', async route => {
    const url = new URL(route.request().url())
    const range = parseRange(url.searchParams.get('range'))
    const groupBy = parseGroupBy(url.searchParams.get('groupBy'))

    const delay = responseDelays[groupBy]

    await new Promise(resolve => setTimeout(resolve, delay))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(permutationResponse(range, groupBy)),
    })
  })

  await page.goto(
    '/trends?packages=react~vs~vue&metric=downloads&range=last-year&groupBy=day',
  )

  for (const range of ranges) {
    for (const groupBy of groups) {
      await selectControl(page, rangeLabels[range])
      await selectControl(page, groupLabels[groupBy])

      const expectedCode =
        (ranges.indexOf(range) + 1) * 100 + groups.indexOf(groupBy)

      const reactCard = page
        .locator('.trends-card')
        .filter({ hasText: 'react' })

      await expect(reactCard.locator('.trends-stat__value').nth(1)).toHaveText(
        String(expectedCode),
      )

      for (const metric of metrics) await assertMetric(page, metric, groupBy)
    }
  }

  await selectControl(page, rangeLabels['last-year'])
  await selectControl(page, groupLabels.day)
  await expect(
    page
      .locator('.trends-card')
      .filter({ hasText: 'react' })
      .locator('.trends-stat__value')
      .nth(1),
  ).toHaveText('200')

  await selectControl(page, rangeLabels['last-3-years'])
  await expect(
    page
      .locator('.trends-card')
      .filter({ hasText: 'react' })
      .locator('.trends-stat__value')
      .nth(1),
  ).toHaveText('300')
  await expectSeriesFullyRevealed(page)

  await page.getByRole('button', { name: '3Y', exact: true }).click()
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await page.getByRole('button', { name: '2M', exact: true }).click()
  await page.getByRole('button', { name: 'Day', exact: true }).click()

  await expect(
    page
      .locator('.trends-card')
      .filter({ hasText: 'react' })
      .locator('.trends-stat__value')
      .nth(1),
  ).toHaveText('100')
})
