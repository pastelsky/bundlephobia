import { expect, test } from '@playwright/test'
import type { TrendsResponse } from '@bundlephobia/service-contracts/trends'
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
    test(`package ${packagePath} retains its npm link before analysis completes`, async ({
      page,
    }) => {
      await page.goto(`/package/${packagePath}`)
      await expect(
        page.getByRole('link', { name: `View ${packageName} on npm` }),
      ).toHaveAttribute('href', `https://npmjs.com/package/${packageName}`)
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

for (const packageName of ['react', '@reduxjs/toolkit']) {
  test(`package ${packageName} aligns logos and compares displayed alternatives on desktop and mobile`, async ({
    page,
  }) => {
    await page.route('**/_events', route =>
      route.fulfill({ json: { code: 200 } }),
    )
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url())

      switch (url.pathname) {
        case '/api/size':
          const requestedName = url.searchParams.get('package') ?? ''

          const name = requestedName.startsWith(`${packageName}@`)
            ? packageName
            : requestedName

          return route.fulfill({
            json: {
              name,
              version: '19.0.0',
              description: `${name} library`,
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
          return route.fulfill({
            json: {
              category: {
                label: 'UI libraries',
                score: 100,
                similar: [
                  packageName,
                  'vue',
                  'preact',
                  'svelte',
                  'solid-js',
                  'lit',
                ],
              },
            },
          })
        case '/api/package-history':
          return route.fulfill({ json: { versions: [] } })
        case '/api/trends':
          return route.fulfill({
            json: {
              packages: [],
              range: 'last-year',
              generatedAt: '2026-10-05T00:00:00Z',
            } satisfies TrendsResponse,
          })
        default:
          return route.fulfill({ json: {} })
      }
    })
    await page.goto(`/package/${packageName}@19.0.0`)

    const links = page.locator('.quick-stats-bar__stat').filter({
      has: page.getByRole('link', { name: `View ${packageName} repository` }),
    })

    await expect(
      links.getByRole('link', { name: `View ${packageName} trends` }),
    ).toHaveCount(0)
    await expect(
      links.getByRole('link', { name: `View ${packageName} on npm` }),
    ).toBeVisible()

    const section = page.locator('.similar-packages-section')

    const compare = section.getByRole('link', {
      name: 'Compare trends',
      exact: true,
    })

    const comparisonPath = `/trends?packages=${[packageName, 'vue', 'preact', 'svelte', 'solid-js'].map(encodeURIComponent).join('~vs~')}`

    await expect(compare).toHaveAttribute('href', comparisonPath)

    const footerLogoColor = await links
      .locator('svg path')
      .last()
      .evaluate(element => getComputedStyle(element).fill)

    const cardLogoColor = await section
      .locator('.similar-package-card__github-icon path')
      .first()
      .evaluate(element => getComputedStyle(element).fill)

    expect(cardLogoColor).toBe(footerLogoColor)

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 812 })

      const npm = await links
        .getByRole('link', { name: `View ${packageName} on npm` })
        .boundingBox()

      const github = await links
        .getByRole('link', { name: `View ${packageName} repository` })
        .boundingBox()

      expect(npm).not.toBeNull()
      expect(github).not.toBeNull()
      expect(npm!.width).toBe(github!.width)
      expect(npm!.height).toBe(github!.height)
      expect(
        Math.abs(npm!.y + npm!.height / 2 - (github!.y + github!.height / 2)),
      ).toBeLessThan(1)

      const box = await page.locator('.autocomplete-input-box').boundingBox()

      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      await expect(compare).toBeVisible()

      if (packageName === 'react') {
        const suffix = width === 375 ? 'mobile' : 'loaded'
        await page
          .locator('.autocomplete-input-box')
          .screenshot({ path: `test-results/package-entry-${suffix}.png` })
        await section.screenshot({
          path: `test-results/similar-packages-${suffix}.png`,
        })
      }
    }

    await compare.click()
    await expect(page).toHaveURL(comparisonPath)

    for (const name of [packageName, 'vue', 'preact', 'svelte', 'solid-js']) {
      await expect(
        page.getByRole('group', {
          name: `${name} selected package`,
          exact: true,
        }),
      ).toBeVisible()
    }
  })
}
