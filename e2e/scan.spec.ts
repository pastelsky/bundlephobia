import { expect, test } from './fixtures/test'
import { cheapPackage } from './test-data/packages'

test('uploads package.json and builds the selected dependency', async ({
  page,
  scanPage,
  scanResultsPage,
}) => {
  await scanPage.goto()
  await scanPage.uploadPackageJson({
    [cheapPackage.name]: cheapPackage.version,
  })

  await expect(scanPage.selectionHeading).toBeVisible()
  await scanPage.selectPackage(cheapPackage.name)
  await scanPage.scanSelectedPackages(1)

  await expect(page).toHaveURL(/\/scan-results\?packages=/)
  await expect(scanResultsPage.heading).toBeVisible()
  await expect(
    scanResultsPage.packageLink(cheapPackage.name, cheapPackage.version),
  ).toBeVisible()
  const packageResult = scanResultsPage.packageResult(
    cheapPackage.name,
    cheapPackage.version,
  )
  await expect(packageResult.getByText('Calculating')).toHaveCount(0)
  await expect(packageResult.getByText('Min', { exact: true })).toBeVisible()
  await expect(packageResult.getByText('Min + GZIP')).toBeVisible()
  await expect(scanResultsPage.total).toBeVisible()
  await expect(scanResultsPage.nextError).toHaveCount(0)
})
