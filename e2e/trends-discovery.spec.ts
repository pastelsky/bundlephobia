import { expect, test } from '@playwright/test'

test.describe('trends SEO and discovery without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the landing page explains the tool and links to starter comparisons', async ({
    page,
  }) => {
    const response = await page.goto('/trends')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(
      'npm package trends & comparisons | Bundlephobia',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bundlephobia.com/trends',
    )
    await expect(
      page.getByRole('heading', { name: 'Compare npm packages over time' }),
    ).toBeVisible()
    await expect(
      page.getByText('Downloads include automated installs and CI jobs;', {
        exact: false,
      }),
    ).toBeVisible()

    for (const packages of [
      'react~vs~vue',
      'lodash~vs~ramda',
      'date-fns~vs~dayjs',
      'axios~vs~ky',
    ]) {
      await expect(
        page.locator(`a[href="/trends?packages=${packages}"]`),
      ).toBeVisible()
    }

    await page
      .locator('.trends-guide')
      .screenshot({ path: 'test-results/trends-discovery-desktop.png' })
  })

  test('the discovery guide stays within a narrow mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/trends')
    const guide = page.locator('.trends-guide')
    await expect(guide).toBeVisible()
    const bounds = await guide.boundingBox()
    expect(bounds?.x).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(375)
    await guide.screenshot({
      path: 'test-results/trends-discovery-mobile.png',
    })
  })

  test('a non-default comparison does not advertise react versus vue in its initial metadata', async ({
    page,
  }) => {
    await page.goto(
      '/trends?packages=lodash~vs~ramda&metric=size&range=last-3-years',
    )
    await expect(page).toHaveTitle(
      'npm package trends & comparisons | Bundlephobia',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'npm package trends & comparisons | Bundlephobia',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bundlephobia.com/trends',
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
    expect(sitemap).not.toContain('/trends?')
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
          name: `View ${packageName} downloads, stars, and size history`,
        }),
      ).toHaveAttribute(
        'href',
        `/trends?packages=${encodeURIComponent(packageName)}`,
      )
    })
  }
})
