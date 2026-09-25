import { expect, test } from './fixtures/test'
import type { Page } from '@playwright/test'
import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'
import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { groupTrendsPackage } from '../utils/trends'

const trendsResponse = {
  range: 'last-year',
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
  await expectSeriesFullyRevealed(page)

  await page.screenshot({
    path: 'artifacts/trends-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/trends-mobile.png', fullPage: true })
})

test('shows progress on a newly added package until its data arrives', async ({
  page,
}) => {
  let releaseThird: (() => void) | undefined
  let signalThirdStarted: () => void = () => {}

  let releaseFourth: (() => void) | undefined

  let signalFourthStarted: () => void = () => {}

  const thirdStarted = new Promise<void>(resolve => {
    signalThirdStarted = resolve
  })

  const fourthStarted = new Promise<void>(resolve => {
    signalFourthStarted = resolve
  })

  await page.route('**/api/trends?*', async route => {
    const requested =
      new URL(route.request().url()).searchParams.get('packages') ?? ''

    if (requested.includes('axios')) {
      signalFourthStarted()
      await new Promise<void>(resolve => {
        releaseFourth = resolve
      })
      await route.fulfill({ status: 503, body: 'Unavailable' })

      return
    }

    if (requested.includes('lodash') && !releaseThird) {
      signalThirdStarted()
      await new Promise<void>(resolve => {
        releaseThird = resolve
      })
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...trendsResponse,
        packages: requested.includes('lodash')
          ? [
              ...trendsResponse.packages,
              { ...trendsResponse.packages[0], name: 'lodash' },
            ]
          : trendsResponse.packages,
      }),
    })
  })

  await page.goto(
    '/trends?packages=react~vs~vue&metric=downloads&range=last-year&groupBy=week',
  )
  await expect(page.locator('.trends-card')).toHaveCount(2)

  const search = page.getByRole('combobox', { name: 'Package name' })

  await search.fill('lodash')
  await search.press('Enter')
  await thirdStarted

  const newChip = page.getByRole('group', {
    name: 'lodash selected package',
  })

  await expect(
    newChip.getByRole('status', { name: 'Loading lodash trends' }),
  ).toBeVisible()
  await expect(
    newChip.getByRole('button', { name: 'Remove lodash' }),
  ).toBeEnabled()
  await expect(page.locator('.trends-card')).toHaveCount(2)

  releaseThird?.()
  await expect(page.locator('.trends-card')).toHaveCount(3)
  await expect(newChip.getByRole('status')).toHaveCount(0)

  await search.fill('axios')
  await search.press('Enter')
  await fourthStarted

  const failedChip = page.getByRole('group', {
    name: 'axios selected package',
  })

  await expect(
    failedChip.getByRole('status', { name: 'Loading axios trends' }),
  ).toBeVisible()
  releaseFourth?.()
  await expect(page.locator('.trends-chart-area__state--error')).toBeVisible()
  await expect(failedChip.getByRole('status')).toHaveCount(0)

  await failedChip.getByRole('button', { name: 'Remove axios' }).click()
  await expect(failedChip).toHaveCount(0)
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

const ranges: TrendsRange[] = ['last-2-months', 'last-year', 'last-3-years']

const groups: TrendsGroupBy[] = ['day', 'week', 'month']

const metrics: TrendsMetric[] = ['downloads', 'stars', 'size']

const responseDelays: Record<TrendsRange, number> = {
  'last-2-months': 140,
  'last-year': 60,
  'last-3-years': 20,
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

function permutationResponse(range: TrendsRange): TrendsResponse {
  const responseCode = (ranges.indexOf(range) + 1) * 100

  const startDates: Record<TrendsRange, string> = {
    'last-2-months': '2026-07-20',
    'last-year': '2025-09-20',
    'last-3-years': '2023-09-20',
  }

  const dates = eachDayOfInterval({
    start: parseISO(startDates[range]),
    end: parseISO('2026-09-20'),
  }).map(date => format(date, 'yyyy-MM-dd'))

  const dailyPoints = (base: number, packageIndex: number) =>
    dates.map((date, index) => ({
      date,
      value: base * (packageIndex + 1) + index * 10,
      partial: index === dates.length - 1,
    }))

  const sizeDates = dates.filter(
    (_, index) => index % 23 === 0 || index === dates.length - 1,
  )

  return {
    range,
    generatedAt: '2026-09-20T00:00:00.000Z',
    packages: ['react', 'vue'].map((name, packageIndex) => ({
      name,
      repository: name === 'react' ? 'facebook/react' : 'vuejs/core',
      downloads: dailyPoints(1_000_000, packageIndex),
      stars: dailyPoints(100_000, packageIndex),
      size: sizeDates.map((date, index) => ({
        date,
        value: 10_000 * (packageIndex + 1) + index * 100,
        version: `1.${index}.0`,
      })),
      releases: [],
      current: {
        weeklyDownloads: responseCode + packageIndex,
        stars: (packageIndex + 1) * 100 + (dates.length - 1) * 10,
        size: 20_000 + packageIndex,
        gzip: 10_000 + packageIndex,
      },
      warnings: [],
    })),
  }
}

function denseDailyResponse(): TrendsResponse {
  const response = permutationResponse('last-3-years')
  const start = parseISO('2023-09-24')

  const dates = Array.from({ length: 1_097 }, (_, index) =>
    format(addDays(start, index), 'yyyy-MM-dd'),
  )

  return {
    ...response,
    packages: response.packages.map((pack, packageIndex) => ({
      ...pack,
      downloads: dates.map((date, index) => ({
        date,
        value: (packageIndex + 1) * 1_000_000 + index * 10_000,
        partial: index === dates.length - 1,
      })),
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
  selection: {
    metric: TrendsMetric
    range: TrendsRange
    groupBy: TrendsGroupBy
  },
): Promise<void> {
  const { metric, range, groupBy } = selection

  const metricButton = page.getByRole('button', {
    name: metricLabels[metric],
    exact: true,
  })

  await selectControl(page, metricLabels[metric])
  await expect(metricButton).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('img', { name: `${metric} trends chart` }),
  ).toBeVisible()

  const expectedCounts = permutationResponse(range).packages.map(pack => {
    const grouped = groupTrendsPackage(pack, groupBy)

    return grouped[metric].length
  })

  await expect
    .poll(() =>
      page.locator('[data-chart-series]').evaluateAll(series =>
        series.map(item => {
          const circleCount = item.querySelectorAll('[data-series-dot]').length

          const denseCount = Number(
            item
              .querySelector('[data-series-marker-path]')
              ?.getAttribute('data-point-count') ?? 0,
          )

          return circleCount + denseCount
        }),
      ),
    )
    .toEqual(expectedCounts)
  await expect(
    page.locator(
      '.trends-chart__svg [d*="NaN"], .trends-chart__svg [cx="NaN"], .trends-chart__svg [cy="NaN"]',
    ),
  ).toHaveCount(0)
}

async function expectSeriesFullyRevealed(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const clipScales = await page
        .locator('[data-series-clip]')
        .evaluateAll(clips =>
          clips.map(clip => new DOMMatrix(getComputedStyle(clip).transform).a),
        )

      return clipScales.length > 0 && clipScales.every(scale => scale > 0.999)
    })
    .toBe(true)
}

async function expectSeriesRevealAfter(
  page: Page,
  changeSelection: () => Promise<void>,
): Promise<void> {
  const previousClip = await page
    .locator('[data-series-clip]')
    .first()
    .elementHandle()

  expect(previousClip).not.toBeNull()
  await changeSelection()

  if (previousClip)
    await expect
      .poll(() => previousClip.evaluate(clip => clip.isConnected))
      .toBe(false)

  await expectActiveSeriesReveal(page)
}

async function expectActiveSeriesReveal(page: Page): Promise<void> {
  const clip = page.locator('[data-series-clip]').first()

  await clip.waitFor({ state: 'attached' })

  const initialScale = await clip.evaluate(
    element => new DOMMatrix(getComputedStyle(element).transform).a,
  )

  expect(initialScale).toBeLessThan(0.8)
  await page.waitForTimeout(180)

  const intermediateScale = await clip.evaluate(
    element => new DOMMatrix(getComputedStyle(element).transform).a,
  )

  expect(intermediateScale).toBeGreaterThan(initialScale)
  expect(intermediateScale).toBeLessThan(1)
  await expectSeriesFullyRevealed(page)
}

test('keeps every metric, range, and grouping permutation consistent', async ({
  page,
}) => {
  const apiRequests: URL[] = []

  await page.route('**/api/trends?*', async route => {
    const url = new URL(route.request().url())
    const range = parseRange(url.searchParams.get('range'))
    apiRequests.push(url)

    const delay = responseDelays[range]

    await new Promise(resolve => setTimeout(resolve, delay))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(permutationResponse(range)),
    })
  })

  await page.goto(
    '/trends?packages=react~vs~vue&metric=downloads&range=last-year&groupBy=day',
  )

  for (const range of ranges) {
    for (const groupBy of groups) {
      await selectControl(page, rangeLabels[range])
      await selectControl(page, groupLabels[groupBy])

      const expectedCode = (ranges.indexOf(range) + 1) * 100

      const reactCard = page
        .locator('.trends-card')
        .filter({ hasText: 'react' })

      await expect(reactCard.locator('.trends-stat__value').nth(1)).toHaveText(
        String(expectedCode),
      )

      for (const metric of metrics)
        await assertMetric(page, { metric, range, groupBy })
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

  expect(
    apiRequests.every(request => !request.searchParams.has('groupBy')),
  ).toBe(true)

  const requestCount = apiRequests.length
  await selectControl(page, groupLabels.week)
  await selectControl(page, groupLabels.month)
  await selectControl(page, groupLabels.day)
  await page.waitForTimeout(200)
  expect(apiRequests).toHaveLength(requestCount)
})

test('restarts the series reveal when a chart selection changes', async ({
  page,
}) => {
  await page.route('**/api/trends?*', async route => {
    await new Promise(resolve => setTimeout(resolve, 500))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(permutationResponse('last-year')),
    })
  })

  await page.goto(
    '/trends?packages=react~vs~vue&metric=downloads&range=last-year&groupBy=day',
    { waitUntil: 'domcontentloaded' },
  )
  await expectActiveSeriesReveal(page)

  await expectSeriesRevealAfter(page, () =>
    selectControl(page, groupLabels.week),
  )
  await expectSeriesRevealAfter(page, () =>
    selectControl(page, metricLabels.stars),
  )
})

test('renders dense daily markers without excessive SVG nodes', async ({
  page,
}) => {
  await page.route('**/api/trends?*', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(denseDailyResponse()),
    }),
  )

  await page.goto(
    '/trends?packages=react~vs~vue&metric=downloads&range=last-3-years&groupBy=day',
  )

  await expect.poll(() => page.locator('[data-series-dot]').count()).toBe(2)
  await expect(page.locator('[data-series-marker-path]')).toHaveCount(2)
  await expect
    .poll(() =>
      page
        .locator('[data-series-marker-path]')
        .evaluateAll(paths =>
          paths.map(path => Number(path.getAttribute('data-point-count'))),
        ),
    )
    .toEqual([1_096, 1_096])
  await expect
    .poll(async () => {
      const path = await page
        .locator('[data-series-marker-path]')
        .first()
        .getAttribute('d')

      return path?.length ?? 0
    })
    .toBeGreaterThan(30_000)
  await expect
    .poll(async () => {
      const path = await page
        .locator('path.trends-chart__line')
        .first()
        .getAttribute('d')

      return path?.length ?? 0
    })
    .toBeGreaterThan(20_000)
  await expectSeriesFullyRevealed(page)

  const chartBox = await page.locator('.trends-chart__svg').boundingBox()

  expect(chartBox).not.toBeNull()

  if (chartBox) {
    await page.mouse.move(
      chartBox.x + (chartBox.width * 500) / 1_096,
      chartBox.y + chartBox.height / 2,
    )
  }

  await expect(page.locator('.trends-chart__tooltip')).toBeVisible()
  await expect(page.locator('.trends-chart__series-dot-magnet')).toHaveCount(2)
})
