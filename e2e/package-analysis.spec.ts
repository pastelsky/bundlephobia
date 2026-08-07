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
    new RegExp(`/package/${cheapPackage.name}@${cheapPackage.version}$`)
  )
  await expect(packagePage.packageHeading(cheapPackage.name)).toBeVisible()
  await expect(packagePage.bundleSizeHeading).toBeVisible()
  await expect(packagePage.downloadTimeHeading).toBeVisible()
  await expect(page.getByText('Minified', { exact: true })).toBeVisible()
  await expect(page.getByText('Minified + Gzipped')).toBeVisible()
  await expect(packagePage.exportsAnalysisHeading).toBeVisible()
  await expect(
    page.getByText('This package does not export ES6 modules.')
  ).toBeVisible()
  await expect(packagePage.nextError).toHaveCount(0)
})

test('renders a real package-not-found response in the result shell', async ({
  packagePage,
  page,
}) => {
  await packagePage.goto(missingPackage)

  await expect(
    page.getByRole('heading', { name: 'PackageNotFoundError' })
  ).toBeVisible()
  await expect(
    page.getByText("The package you were looking for doesn't exist.")
  ).toBeVisible()
  await expect(packagePage.searchInput).toBeVisible()
  await expect(packagePage.nextError).toHaveCount(0)
})
