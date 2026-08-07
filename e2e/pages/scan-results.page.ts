import { type Locator, type Page } from '@playwright/test'

import { AppPage } from './app.page'

export class ScanResultsPage extends AppPage {
  readonly heading: Locator
  readonly total: Locator

  constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: 'Results' })
    this.total = page.getByText('Total')
  }

  packageLink(name: string, version: string) {
    return this.page.getByRole('link', { name: `${name} v${version}` })
  }

  packageResult(name: string, version: string) {
    return this.page.getByRole('listitem').filter({
      has: this.packageLink(name, version),
    })
  }
}
