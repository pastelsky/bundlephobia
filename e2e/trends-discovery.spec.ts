import { expect, test } from '@playwright/test'
import {
  trendsComparisons,
  trendsComparisonPath,
} from '../seo/trends-comparisons'

test.describe('trends SEO and discovery without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the landing page has matching initial metadata', async ({ page }) => {
    const response = await page.goto('/trends')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(
      'npm package trends & comparisons | Bundlephobia',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bundlephobia.com/trends',
    )
  })

  test('a non-default comparison does not advertise react versus vue in its initial metadata', async ({
    page,
  }) => {
    await page.goto(
      '/trends?packages=axios~vs~ky&metric=size&range=last-3-years',
    )
    await expect(page).toHaveTitle(
      'axios vs ky — downloads, stars & size | Bundlephobia',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'axios vs ky — downloads, stars & size | Bundlephobia',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bundlephobia.com/trends?packages=axios~vs~ky',
    )
  })

  test('the sitemap includes the canonical landing page once', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)
    const sitemap = await response.text()
    expect(
      sitemap.match(/<loc>https:\/\/bundlephobia.com\/trends<\/loc>/g),
    ).toHaveLength(1)

    for (const packages of trendsComparisons) {
      const url = `<loc>https://bundlephobia.com${trendsComparisonPath(packages)}</loc>`
      expect(sitemap.split(url)).toHaveLength(2)

      for (const name of packages) {
        expect(
          sitemap.split(`<loc>https://bundlephobia.com/package/${name}</loc>`),
        ).toHaveLength(2)
      }
    }

    expect(sitemap).not.toMatch(/metric=|range=|groupBy=/)

    // These come from existing peer groups and similar-package categories,
    // including a pair that was not in the old SEO list.
    for (const packages of [
      ['react', 'vue'],
      ['axios', 'ky'],
      ['formik', 'react-hook-form'],
      ['clsx', 'classix'],
    ]) {
      expect(sitemap).toContain(
        `<loc>https://bundlephobia.com${trendsComparisonPath(packages)}</loc>`,
      )
    }
  })

  for (const [packagePath, packageName] of [
    ['react@19.0.0', 'react'],
    ['@reduxjs/toolkit@2.0.0', '@reduxjs/toolkit'],
  ]) {
    test(`package ${packagePath} links to its unversioned trends without waiting for a build`, async ({
      page,
    }) => {
      await page.goto(`/package/${packagePath}`)
      await expect(
        page.getByRole('link', {
          name: `View ${packageName} trends`,
        }),
      ).toHaveAttribute(
        'href',
        `/trends?packages=${encodeURIComponent(packageName)}`,
      )

      const link = page.getByRole('link', {
        name: `View ${packageName} trends`,
      })

      await expect(link.locator('svg')).toBeVisible()
      await expect(
        page.getByRole('link', { name: `View ${packageName} on npm` }),
      ).toBeVisible()
      await page.locator('.autocomplete-input-box').screenshot({
        path: `test-results/package-entry-${packageName === 'react' ? 'react' : 'scoped'}.png`,
      })
    })
  }

  test('comparisons from peer groups and similar categories have matching initial HTML', async ({
    page,
  }) => {
    for (const packages of [
      ['react', 'vue'],
      ['date-fns', 'dayjs'],
      ['axios', 'ky'],
      ['@sinclair/typebox', 'valibot'],
      ['clsx', 'classix'],
    ]) {
      await page.goto(trendsComparisonPath(packages))
      await expect(page).toHaveTitle(
        `${packages.join(' vs ')} — downloads, stars & size | Bundlephobia`,
      )
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://bundlephobia.com${trendsComparisonPath(packages)}`,
      )

      for (const name of packages)
        await expect(
          page.getByRole('group', {
            name: `${name} selected package`,
            exact: true,
          }),
        ).toBeVisible()
    }
  })

  test('package order and filters consolidate to the same comparison', async ({
    page,
  }) => {
    await page.goto(
      '/trends?packages=dayjs~vs~date-fns&metric=size&range=last-3-years&groupBy=month',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bundlephobia.com/trends?packages=date-fns~vs~dayjs',
    )
    await page.goto('/trends?packages=some-unlisted-package~vs~react')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bundlephobia.com/trends',
    )
  })
})

test('loaded package links keep the trends icon next to npm and GitHub on mobile', async ({
  page,
}) => {
  await page.route('**/_events', route =>
    route.fulfill({ json: { code: 200 } }),
  )
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())

    switch (url.pathname) {
      case '/api/size':
        return route.fulfill({
          json: {
            name: 'react',
            version: '19.0.0',
            description: 'React',
            repository: 'https://github.com/facebook/react',
            size: 10000,
            gzip: 3000,
            dependencyCount: 0,
            hasSideEffects: true,
            hasJSModule: false,
            hasJSNext: false,
            isModuleType: false,
          },
        })
      case '/api/similar-packages':
        return route.fulfill({ json: { category: '', similar: [] } })
      case '/api/package-history':
        return route.fulfill({ json: { versions: [] } })
      default:
        return route.fulfill({ json: {} })
    }
  })
  await page.goto('/package/react@19.0.0')

  const links = page
    .locator('.quick-stats-bar__stat')
    .filter({ has: page.getByRole('link', { name: 'View react repository' }) })

  await expect(
    links.getByRole('link', { name: 'View react trends' }),
  ).toBeVisible()
  await expect(
    links.getByRole('link', { name: 'View react on npm' }),
  ).toBeVisible()
  await page
    .locator('.autocomplete-input-box')
    .screenshot({ path: 'test-results/package-entry-loaded.png' })
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(
    links.getByRole('link', { name: 'View react trends' }),
  ).toBeVisible()
  const box = await page.locator('.autocomplete-input-box').boundingBox()

  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375)
  await page
    .locator('.autocomplete-input-box')
    .screenshot({ path: 'test-results/package-entry-mobile.png' })
})
