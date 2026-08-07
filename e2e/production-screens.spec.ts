import { expect, test } from './fixtures/test'

test.describe('production screens', () => {
  const screens = [
    { path: '/', landmark: /find the cost of adding a npm package/i },
    { path: '/scan', landmark: 'Scan from URL / GitHub' },
    { path: '/blog', landmark: 'Blogosphere' },
  ]

  for (const { path, landmark } of screens) {
    test(`${path} renders`, async ({ appPage, page }) => {
      const response = await appPage.goto(path)

      expect(response?.status()).toBe(200)
      await expect(
        page.getByText(landmark, { exact: false }).first()
      ).toBeVisible()
      await expect(appPage.nextError).toHaveCount(0)
    })
  }

  test('the blog article route renders its application shell', async ({
    appPage,
    page,
  }) => {
    const response = await appPage.goto('/blog/digital-ocean-partnership')

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('link', { name: 'Blog' })).toBeVisible()
    await expect(appPage.nextError).toHaveCount(0)
  })

  test('/404 retains the not-found contract', async ({ appPage, page }) => {
    const response = await appPage.goto('/does-not-exist')

    expect(response?.status()).toBe(404)
    await expect(page.getByText('This page could not be found')).toBeVisible()
    await expect(appPage.nextError).toHaveCount(0)
  })
})
