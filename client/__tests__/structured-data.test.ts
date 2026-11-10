import {
  createBreadcrumbStructuredData,
  createPackageStructuredData,
  createTrendsStructuredData,
  createWebSiteStructuredData,
  serializeJsonLd,
} from '../seo/structured-data'

describe('structured-data', () => {
  describe('serializeJsonLd', () => {
    it('serializes objects to JSON string', () => {
      const data = {
        '@context': 'https://schema.org',
        '@type': 'Thing',
        name: 'test',
      } as const

      expect(serializeJsonLd(data)).toBe(
        '{"@context":"https://schema.org","@type":"Thing","name":"test"}',
      )
    })

    it('escapes opening angle brackets to prevent script injection', () => {
      const maliciousData = {
        '@context': 'https://schema.org',
        '@type': 'Thing',
        description: '</script><script>alert("xss")</script>',
      } as const

      const serialized = serializeJsonLd(maliciousData)

      expect(serialized).not.toContain('</script>')
      expect(serialized).toContain('\\u003c/script>')
    })
  })

  describe('createWebSiteStructuredData', () => {
    it('creates default WebSite schema for Bundlephobia', () => {
      const schema = createWebSiteStructuredData()
      const parsed = JSON.parse(JSON.stringify(schema))

      expect(parsed['@context']).toBe('https://schema.org')
      expect(parsed['@type']).toBe('WebSite')
      expect(parsed.name).toBe('Bundlephobia')
      expect(parsed.alternateName).toEqual(['bundlephobia', 'bundlephobia.com'])
      expect(parsed.url).toBe('https://bundlephobia.com')
    })
  })

  describe('createPackageStructuredData', () => {
    it('creates a graph with SoftwareApplication and BreadcrumbList', () => {
      const graph = createPackageStructuredData({
        name: 'lodash',
        version: '4.17.21',
        description: 'Lodash modular utilities',
        fileSize: '71.2 kB',
        repository: 'https://github.com/lodash/lodash',
        origin: 'https://bundlephobia.com',
      })

      const parsed = JSON.parse(JSON.stringify(graph))

      expect(parsed['@context']).toBe('https://schema.org')
      expect(parsed['@graph']).toHaveLength(2)

      const app = parsed['@graph'][0]
      const breadcrumbs = parsed['@graph'][1]

      expect(app['@type']).toBe('SoftwareApplication')
      expect(app.name).toBe('lodash')
      expect(app.softwareVersion).toBe('4.17.21')
      expect(app.fileSize).toBe('71.2 kB')
      expect(app.isAccessibleForFree).toBe(true)
      expect(app.operatingSystem).toBe('Cross-platform')
      expect(app.sameAs).toEqual([
        'https://github.com/lodash/lodash',
        'https://www.npmjs.com/package/lodash',
      ])

      expect(breadcrumbs['@type']).toBe('BreadcrumbList')
      expect(breadcrumbs.itemListElement).toHaveLength(2)
      expect(breadcrumbs.itemListElement[0].name).toBe('Home')
      expect(breadcrumbs.itemListElement[1].name).toBe('lodash')
      expect(breadcrumbs.itemListElement[1].item).toBe(
        'https://bundlephobia.com/package/lodash',
      )
    })

    it('handles packages without repository gracefully', () => {
      const graph = createPackageStructuredData({
        name: 'no-repo-pkg',
        description: 'Package without git repository',
      })

      const parsed = JSON.parse(JSON.stringify(graph))
      const app = parsed['@graph'][0]

      expect(app.sameAs).toEqual(['https://www.npmjs.com/package/no-repo-pkg'])
    })
  })

  describe('createBreadcrumbStructuredData', () => {
    it('creates sequential breadcrumb items with resolved URLs', () => {
      const breadcrumbs = createBreadcrumbStructuredData([
        { name: 'Home', url: '/' },
        { name: 'Scan', url: '/scan' },
      ])

      const parsed = JSON.parse(JSON.stringify(breadcrumbs))

      expect(parsed['@context']).toBe('https://schema.org')
      expect(parsed['@type']).toBe('BreadcrumbList')
      expect(parsed.itemListElement).toHaveLength(2)
      expect(parsed.itemListElement[0]).toEqual({
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://bundlephobia.com/',
      })
      expect(parsed.itemListElement[1]).toEqual({
        '@type': 'ListItem',
        position: 2,
        name: 'Scan',
        item: 'https://bundlephobia.com/scan',
      })
    })
  })

  describe('createTrendsStructuredData', () => {
    it('creates WebPage with 2-tier breadcrumbs for base trends page', () => {
      const schema = createTrendsStructuredData({
        pageTitle: 'JavaScript Trends',
        description: 'Compare npm package size trends over time',
        canonicalPath: '/trends',
      })

      const parsed = JSON.parse(JSON.stringify(schema))

      expect(parsed['@context']).toBe('https://schema.org')
      expect(parsed['@type']).toBe('WebPage')
      expect(parsed.name).toBe('JavaScript Trends')

      const breadcrumb = parsed.breadcrumb
      expect(breadcrumb.itemListElement).toHaveLength(2)
      expect(breadcrumb.itemListElement[1].name).toBe('Trends')
      expect(parsed.mainEntity).toBeUndefined()
    })

    it('creates WebPage with 3-tier breadcrumbs and ItemList for package comparisons', () => {
      const schema = createTrendsStructuredData({
        packages: ['react', 'vue'],
        pageTitle: 'React vs Vue Trends',
        description: 'Compare React and Vue trends',
        canonicalPath: '/trends?p=react~vs~vue',
      })

      const parsed = JSON.parse(JSON.stringify(schema))

      const breadcrumb = parsed.breadcrumb
      expect(breadcrumb.itemListElement).toHaveLength(3)
      expect(breadcrumb.itemListElement[2].name).toBe('react vs vue')

      const mainEntity = parsed.mainEntity
      expect(mainEntity['@type']).toBe('ItemList')
      expect(mainEntity.name).toBe('react vs vue comparison')
      expect(mainEntity.itemListElement).toHaveLength(2)
      expect(mainEntity.itemListElement[0].name).toBe('react')
      expect(mainEntity.itemListElement[1].name).toBe('vue')
    })
  })
})
