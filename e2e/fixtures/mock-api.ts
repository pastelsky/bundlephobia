import type { Page, Route } from '@playwright/test'

const packageResults = {
  react: {
    name: 'react',
    version: '18.2.0',
    description: 'A JavaScript library for building user interfaces',
    repository: 'https://github.com/facebook/react',
    size: 8_100,
    gzip: 3_200,
    dependencyCount: 0,
    hasSideEffects: false,
    hasJSModule: true,
    hasJSNext: false,
    isModuleType: false,
    dependencySizes: [],
  },
  lodash: {
    name: 'lodash',
    version: '4.17.21',
    description: 'A modern JavaScript utility library',
    repository: 'https://github.com/lodash/lodash',
    size: 71_000,
    gzip: 25_000,
    dependencyCount: 0,
    hasSideEffects: true,
    hasJSModule: false,
    hasJSNext: false,
    isModuleType: false,
    dependencySizes: [],
  },
} as const

type PackageName = keyof typeof packageResults

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

function getPackageName(specifier: string | null): PackageName | null {
  const name = specifier?.split('@')[0]
  return name === 'react' || name === 'lodash' ? name : null
}

const contentfulResponse = {
  sys: { type: 'Array' },
  total: 1,
  skip: 0,
  limit: 100,
  items: [
    {
      sys: {
        id: 'digital-ocean',
        type: 'Entry',
        createdAt: '2020-01-01T00:00:00Z',
      },
      fields: {
        title: 'Bundlephobia and DigitalOcean',
        slug: 'digital-ocean-partnership',
        createdAt: '2020-01-01T00:00:00Z',
        content: {
          nodeType: 'document',
          data: {},
          content: [
            {
              nodeType: 'paragraph',
              data: {},
              content: [
                {
                  nodeType: 'text',
                  value: 'A Bundlephobia partnership update.',
                  marks: [],
                  data: {},
                },
              ],
            },
          ],
        },
      },
    },
  ],
  includes: {},
}

export async function mockExternalRequests(page: Page) {
  await page.route('https://api.npms.io/**', route =>
    json(route, [
      {
        package: {
          name: 'react',
          description: packageResults.react.description,
        },
        searchScore: 100,
        score: { detail: { popularity: 1 } },
      },
    ])
  )

  await page.route(/https:\/\/(cdn|preview)\.contentful\.com\/.*/, route =>
    json(route, contentfulResponse)
  )
}

export async function mockBundlephobiaApi(page: Page) {
  await mockExternalRequests(page)

  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    const packageName = getPackageName(url.searchParams.get('package'))

    switch (url.pathname) {
      case '/api/size':
        return packageName
          ? json(route, packageResults[packageName])
          : json(
              route,
              {
                error: {
                  code: 'PackageNotFoundError',
                  message: 'The requested package does not exist.',
                },
              },
              404
            )
      case '/api/package-history':
        return json(route, {
          '17.0.2': {
            size: 7_900,
            gzip: 3_100,
            hasSideEffects: false,
            hasJSModule: true,
            hasJSNext: false,
            isModuleType: false,
          },
        })
      case '/api/similar-packages':
        return json(route, { category: { score: 0, similar: [] } })
      case '/api/exports':
        return json(route, { exports: { createElement: './index.js' } })
      case '/api/exports-sizes':
        return json(route, {
          assets: [{ name: 'createElement', gzip: 1_200, type: 'js' }],
        })
      case '/api/dependencies':
        return json(route, [])
      case '/api/recent':
        return json(route, {
          react: {
            name: 'react',
            version: '18.2.0',
            lastSearched: 1,
            count: 1,
          },
        })
      default:
        return route.continue()
    }
  })
}
