import { test, type Locator, type Page } from '@playwright/test'

import { AppPage } from './app.page'

export class ScanPage extends AppPage {
  readonly fileInput: Locator
  readonly selectionHeading: Locator

  constructor(page: Page) {
    super(page)
    this.fileInput = page.locator('input[type="file"]')
    this.selectionHeading = page.getByRole('heading', {
      name: /select packages to scan/i,
    })
  }

  async goto() {
    return super.goto('/scan')
  }

  async uploadPackageJson(dependencies: Record<string, string>) {
    await test.step('Upload package.json', () =>
      this.fileInput.setInputFiles({
        name: 'package.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ dependencies })),
      }))
  }

  async selectPackage(name: string) {
    await test.step(`Select ${name}`, () =>
      this.page.getByRole('checkbox', { name: new RegExp(name, 'i') }).check())
  }

  async scanSelectedPackages(count: number) {
    await test.step(`Scan ${count} selected package`, () =>
      this.page.getByRole('button', { name: `Scan ${count} packages` }).click())
  }
}
