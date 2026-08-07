import { type Locator, type Page } from '@playwright/test'

import { AppPage } from './app.page'

export class PackagePage extends AppPage {
  readonly searchInput: Locator
  readonly bundleSizeHeading: Locator
  readonly downloadTimeHeading: Locator
  readonly exportsAnalysisHeading: Locator

  constructor(page: Page) {
    super(page)
    this.searchInput = page.getByRole('combobox', { name: 'Package name' })
    this.bundleSizeHeading = page.getByRole('heading', { name: 'Bundle Size' })
    this.downloadTimeHeading = page.getByRole('heading', {
      name: 'Download Time',
    })
    this.exportsAnalysisHeading = page.getByRole('heading', {
      name: 'Exports Analysis',
    })
  }

  async goto(packageSpecifier: string) {
    return super.goto(`/package/${packageSpecifier}`)
  }

  packageHeading(name: string) {
    return this.page.getByRole('heading', { name })
  }
}
