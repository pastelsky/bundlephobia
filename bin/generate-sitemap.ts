import { writeFileSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { SitemapStream, streamToPromise } from 'sitemap'
import formatXML from 'xml-formatter'
import { trendsComparisons, trendsComparisonPath } from '../seo/trends-comparisons'
import { categories, comparisonGroups } from '../utils/similarPackages'

const packageNames = new Set([
  ...Object.values(categories).flatMap(category => category.similar),
  ...comparisonGroups.flatMap(group => group.packages),
])

const otherPages = ['', '/scan', '/trends']

const links = [
  ...otherPages.map(page => ({
    url: page,
    changefreq: 'weekly' as const,
    priority: 1,
  })),
  ...[...packageNames].map(packageName => ({
    url: `/package/${packageName}`,
    changefreq: 'weekly' as const,
    priority: 0.7,
  })),
  ...trendsComparisons.map(packages => ({
    url: trendsComparisonPath(packages),
    changefreq: 'weekly' as const,
    priority: 0.7,
  })),
]

const stream = new SitemapStream({ hostname: 'https://bundlephobia.com' })

streamToPromise(Readable.from(links).pipe(stream))
  .then(data =>
    formatXML(data.toString(), {
      indentation: '    ',
      collapseContent: true,
      lineSeparator: '\n',
    }) + '\n'
  )
  .then(sitemap => {
    writeFileSync(
      path.join(__dirname, '..', 'client', 'assets', 'public', 'sitemap.xml'),
      sitemap,
      'utf8'
    )
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
