import { test, type Locator, type Page } from '@playwright/test'

import { AppPage } from './app.page'

export class HomePage extends AppPage {
  readonly searchInput: Locator
  readonly searchButton: Locator
  readonly tagline: Locator

  constructor(page: Page) {
    super(page)
    this.searchInput = page.getByRole('combobox', { name: 'Package name' })
    this.searchButton = page.getByRole('button', { name: 'Search package' })
    this.tagline = page.getByRole('heading', {
      name: /find the cost of adding a npm package/i,
    })
  }

  async goto() {
    return super.goto('/')
  }

  async searchFor(packageSpecifier: string) {
    await test.step(`Search for ${packageSpecifier}`, async () => {
      await this.searchInput.fill(packageSpecifier)
      await this.searchButton.click()
    })
  }
}
