import { test, type Locator, type Page } from '@playwright/test'

export class AppPage {
  readonly nextError: Locator

  constructor(readonly page: Page) {
    this.nextError = page.locator('nextjs-portal')
  }

  async goto(path: string) {
    return test.step(`Open ${path}`, () => this.page.goto(path))
  }
}
