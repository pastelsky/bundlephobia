import { expect, test } from './fixtures/test'
import { cheapPackage, missingPackage } from './test-data/packages'

test('searches for and builds a real package', async ({
  homePage,
  packagePage,
  page,
}) => {
  await homePage.goto()
  await homePage.searchFor(cheapPackage.specifier)

  await expect(page).toHaveURL(
    new RegExp(`/package/${cheapPackage.name}@${cheapPackage.version}$`),
  )
  await expect(packagePage.packageHeading(cheapPackage.name)).toBeVisible()
  await expect(packagePage.bundleSizeHeading).toBeVisible()
  await expect(packagePage.downloadTimeHeading).toBeVisible()
  await expect(page.getByText('Minified', { exact: true })).toBeVisible()
  await expect(page.getByText('Minified + Gzipped')).toBeVisible()
  await expect(packagePage.exportsAnalysisHeading).toBeVisible()
  await expect(
    page.getByText('This package does not export ES6 modules.'),
  ).toBeVisible()
  await expect(packagePage.nextError).toHaveCount(0)
})

test('submits a typed package with one Enter while suggestions are open', async ({
  homePage,
  page,
}) => {
  await page.route('**/v2/search/suggestions?q=react', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          package: {
            name: 'react',
            description: 'A JavaScript library for building user interfaces.',
          },
          score: { detail: { popularity: 1 } },
          searchScore: 1,
        },
      ]),
    }),
  )

  await homePage.goto()
  await homePage.searchInput.fill('react')
  await expect(page.getByRole('option').first()).toBeVisible()
  await homePage.searchInput.press('Enter')

  await expect(page).toHaveURL(/\/package\/react$/)
})

test('renders a real package-not-found response in the result shell', async ({
  packagePage,
  page,
}) => {
  await packagePage.goto(missingPackage)

  await expect(
    page.getByRole('heading', { name: 'PackageNotFoundError' }),
  ).toBeVisible()
  await expect(
    page.getByText("The package you were looking for doesn't exist."),
  ).toBeVisible()
  await expect(packagePage.searchInput).toBeVisible()
  await expect(packagePage.nextError).toHaveCount(0)
})
