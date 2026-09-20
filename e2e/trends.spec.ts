import { expect, test } from './fixtures/test'
import type { TrendsResponse } from '@bundlephobia/service-contracts/trends'

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
