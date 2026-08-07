import { test as base } from '@playwright/test'

import { AppPage } from '../pages/app.page'
import { HomePage } from '../pages/home.page'
import { PackagePage } from '../pages/package.page'
import { ScanPage } from '../pages/scan.page'
import { ScanResultsPage } from '../pages/scan-results.page'

type BundlephobiaFixtures = {
  appPage: AppPage
  homePage: HomePage
  packagePage: PackagePage
  scanPage: ScanPage
  scanResultsPage: ScanResultsPage
}

export const test = base.extend<BundlephobiaFixtures>({
  appPage: async ({ page }, provide) => {
    await provide(new AppPage(page))
  },
  homePage: async ({ page }, provide) => {
    await provide(new HomePage(page))
  },
  packagePage: async ({ page }, provide) => {
    await provide(new PackagePage(page))
  },
  scanPage: async ({ page }, provide) => {
    await provide(new ScanPage(page))
  },
  scanResultsPage: async ({ page }, provide) => {
    await provide(new ScanResultsPage(page))
  },
})

export { expect } from '@playwright/test'
