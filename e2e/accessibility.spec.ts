import { expect, test } from '@playwright/test'

test('the first Tab skips the site navigation and reaches search', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#page-content')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('combobox', { name: 'Package name' }),
  ).toBeFocused()
})

test('Escape closes an in-flight scan URL form and restores its trigger', async ({
  page,
}) => {
  await page.route('https://example.test/package.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 500))
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { dependencies: { 'is-number': '7.0.0' } },
    })
  })

  await page.goto('/scan')
  const trigger = page.getByRole('button', { name: /scan from url/i })
  await trigger.press('Enter')
  const input = page.getByRole('textbox', { name: 'Package.json URL' })
  await expect(input).toBeFocused()
  await input.fill('https://example.test/package.json')
  await input.press('Enter')
  await expect(input).toHaveAttribute('readonly', '')
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('keyboard users can select a package version with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.route('**/api/size?*', route => {
    const requestedPackage = new URL(route.request().url()).searchParams.get(
      'package',
    )

    const version = requestedPackage?.split('@')[1] ?? '7.0.0'

    return route.fulfill({
      json: {
        name: 'is-number',
        version,
        size: 470,
        gzip: 269,
        dependencyCount: 0,
        description: 'Checks if a value is a number',
        hasSideEffects: true,
      },
    })
  })
  await page.route('**/api/package-history?*', route =>
    route.fulfill({
      json: {
        versions: [
          { version: '6.0.0', size: 480, gzip: 278, built: true },
          { version: '7.0.0', size: 470, gzip: 269, built: true },
        ],
      },
    }),
  )
  await page.route('**/api/similar-packages?*', route =>
    route.fulfill({ json: { category: { label: '', score: 0, similar: [] } } }),
  )

  await page.goto('/package/is-number')
  const previous = page.getByRole('button', { name: /View version 6\.0\.0/ })
  await expect(previous).toHaveCSS('animation-name', 'none')
  await previous.press('Enter')
  await expect(page).toHaveURL(/\/package\/is-number@6\.0\.0$/)
  await expect(page.getByRole('heading', { name: 'Bundle Size' })).toBeFocused()
})

test('keyboard search recovers when suggestions fail', async ({ page }) => {
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))

  await page.route('**/v2/search/suggestions?*', route => {
    const query = new URL(route.request().url()).searchParams.get('q')
    const headers = { 'access-control-allow-origin': '*' }

    if (query !== 'react') {
      return route.fulfill({ status: 503, headers, json: {} })
    }

    return route.fulfill({
      headers,
      json: [
        {
          package: {
            name: 'react',
            description: 'A JavaScript library for building user interfaces.',
          },
          score: { detail: { popularity: 1 } },
          searchScore: 1,
        },
      ],
    })
  })

  await page.goto('/')
  const search = page.getByRole('combobox', { name: 'Package name' })

  const failed = page.waitForResponse(response =>
    response.url().includes('/v2/search/suggestions?q=bad'),
  )

  await search.fill('bad')
  expect((await failed).status()).toBe(503)
  await search.fill('react')
  await expect(page.getByRole('option').first()).toContainText('react')
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/)
  expect(errors).toEqual([])
})
