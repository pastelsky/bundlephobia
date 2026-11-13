import type {
  BreadcrumbList,
  Graph,
  ListItem,
  SoftwareApplication,
  Thing,
  WebPage,
  WebSite,
  WithContext,
} from 'schema-dts'

export type StructuredData = WithContext<Thing> | Graph | readonly Thing[]

export function serializeJsonLd(data: StructuredData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export interface WebSiteStructuredDataOptions {
  name?: string
  alternateNames?: string[]
  url?: string
  description?: string
}

export function createWebSiteStructuredData(
  options: WebSiteStructuredDataOptions = {},
): WithContext<WebSite> {
  const {
    name = 'Bundlephobia',
    alternateNames = ['bundlephobia', 'bundlephobia.com'],
    url = 'https://bundlephobia.com',
    description = 'Find the cost and bundle size of adding any npm package to your frontend application.',
  } = options

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    alternateName: alternateNames,
    url,
    description,
  }
}

export interface BreadcrumbItem {
  name: string
  url?: string
}

export function createBreadcrumbStructuredData(
  items: BreadcrumbItem[],
  origin = 'https://bundlephobia.com',
): WithContext<BreadcrumbList> {
  const itemListElement: ListItem[] = items.map((item, index) => {
    const listItem: ListItem = {
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
    }

    if (item.url) {
      listItem.item = item.url.startsWith('http')
        ? item.url
        : `${origin}${item.url}`
    }

    return listItem
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  }
}

export interface PackageStructuredDataOptions {
  name: string
  version?: string | null
  description: string
  fileSize?: string
  repository?: string | null
  origin?: string
}

export function createPackageStructuredData(
  options: PackageStructuredDataOptions,
): Graph {
  const {
    name,
    version,
    description,
    fileSize,
    repository,
    origin = 'https://bundlephobia.com',
  } = options

  const canonicalUrl = `${origin}/package/${name}`

  const sameAs: string[] = []

  if (repository) {
    sameAs.push(repository)
  }

  sameAs.push(`https://www.npmjs.com/package/${name}`)

  const softwareApp: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    '@id': `${canonicalUrl}#software`,
    name,
    softwareVersion: version ?? undefined,
    description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    isAccessibleForFree: true,
    fileSize: fileSize || undefined,
    url: canonicalUrl,
    sameAs,
  }

  const breadcrumbs: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: origin,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: canonicalUrl,
      },
    ],
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [softwareApp, breadcrumbs],
  }
}

export interface TrendsStructuredDataOptions {
  packages?: string[]
  pageTitle: string
  description: string
  canonicalPath?: string
  origin?: string
}

export function createTrendsStructuredData(
  options: TrendsStructuredDataOptions,
): WithContext<WebPage> {
  const {
    packages = [],
    pageTitle,
    description,
    canonicalPath = '/trends',
    origin = 'https://bundlephobia.com',
  } = options

  const isComparison = packages.length > 0
  const pageUrl = `${origin}${canonicalPath}`

  const breadcrumbsList: ListItem[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: origin,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Trends',
      item: `${origin}/trends`,
    },
  ]

  if (isComparison) {
    breadcrumbsList.push({
      '@type': 'ListItem',
      position: 3,
      name: packages.join(' vs '),
      item: pageUrl,
    })
  }

  const breadcrumb: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbsList,
  }

  const webPage: WithContext<WebPage> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pageTitle,
    description,
    url: pageUrl,
    breadcrumb,
  }

  if (isComparison) {
    webPage.mainEntity = {
      '@type': 'ItemList',
      name: `${packages.join(' vs ')} comparison`,
      itemListElement: packages.map((pkg, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: pkg,
        item: {
          '@type': 'SoftwareApplication',
          name: pkg,
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Cross-platform',
          isAccessibleForFree: true,
          url: `${origin}/package/${pkg}`,
        },
      })),
    }
  }

  return webPage
}
