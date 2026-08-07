import { expect, test } from '@playwright/test'

import { mockBundlephobiaApi } from './fixtures/mock-api'

test.beforeEach(async ({ page }) => {
  await mockBundlephobiaApi(page)
})

test.describe('production screens', () => {
  const screens = [
    { path: '/', landmark: /find the cost of adding a npm package/i },
    { path: '/package/react', landmark: 'Bundle Size' },
    { path: '/scan', landmark: 'Scan from URL / GitHub' },
    { path: '/scan-results?packages=react', landmark: 'Results' },
    { path: '/blog', landmark: 'Blogosphere' },
    {
      path: '/blog/digital-ocean-partnership',
      landmark: 'Bundlephobia and DigitalOcean',
    },
  ]

  for (const { path, landmark } of screens) {
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path)

      expect(response?.status()).toBe(200)
      await expect(
        page.getByText(landmark, { exact: false }).first()
      ).toBeVisible()
      await expect(page.locator('nextjs-portal')).toHaveCount(0)
    })
  }

  test('/404 retains the not-found contract', async ({ page }) => {
    const response = await page.goto('/does-not-exist')

    expect(response?.status()).toBe(404)
    await expect(page.getByText('This page could not be found')).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })
})

test('searches from the homepage and renders package analysis', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByRole('combobox', { name: 'Package name' }).fill('react')
  await page.getByRole('button', { name: 'Search package' }).click()

  await expect(page).toHaveURL(/\/package\/react@18\.2\.0$/)
  await expect(page.getByRole('heading', { name: 'react' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bundle Size' })).toBeVisible()
  await expect(page.getByText('side-effect free')).toBeVisible()
  await expect(page.getByText('createElement')).toBeVisible()
})

test('shows a package error without breaking the result shell', async ({
  page,
}) => {
  await page.goto('/package/not-a-real-package')

  await expect(
    page.getByRole('heading', { name: 'PackageNotFoundError' })
  ).toBeVisible()
  await expect(
    page.getByText('The requested package does not exist.')
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Package name' })
  ).toBeVisible()
})

test('uploads package.json and scans selected dependencies', async ({
  page,
}) => {
  await page.goto('/scan')

  await page.locator('input[type="file"]').setInputFiles({
    name: 'package.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ dependencies: { react: '18.2.0', lodash: '4.17.21' } })
    ),
  })

  await expect(
    page.getByRole('heading', { name: /select packages to scan/i })
  ).toBeVisible()
  await page.getByRole('checkbox', { name: /react/i }).check()
  await page.getByRole('checkbox', { name: /lodash/i }).check()
  await page.getByRole('button', { name: 'Scan 2 packages' }).click()

  await expect(page).toHaveURL(/\/scan-results\?packages=/)
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'react v18.2.0' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'lodash v4.17.21' })
  ).toBeVisible()
  await expect(page.getByText('Total')).toBeVisible()
})
