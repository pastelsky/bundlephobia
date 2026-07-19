import Link from 'next/link'
import React from 'react'

import MetaTags from '../../client/components/MetaTags'
import ResultLayout from '../../client/components/ResultLayout'
import {
  CURATED_CATEGORIES,
  CURATED_COMPARISONS,
} from '../../seo/curated-content'

export default function ComparisonsIndexPage() {
  return (
    <ResultLayout className="curated-page">
      <MetaTags
        title="Compare npm package bundle sizes | Bundlephobia"
        description="Compare npm packages by minified size, gzip size, dependency count, and module support using Bundlephobia's latest cached analyses."
        canonicalPath="/compare"
      />
      <main className="curated-page__main">
        <header className="curated-page__intro">
          <p className="curated-page__eyebrow">Package guides</p>
          <h1>Compare npm package bundle sizes</h1>
          <p>
            Start with a focused comparison, then open any package for version
            history, exports, and composition details.
          </p>
        </header>

        <nav className="curated-index" aria-label="Package comparisons">
          <h2>Curated comparisons</h2>
          <ul>
            {CURATED_COMPARISONS.map(comparison => (
              <li key={comparison.slug}>
                <Link href={`/compare/${comparison.slug}`}>
                  <strong>{comparison.title}</strong>
                  <span>{comparison.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="curated-index" aria-label="Package categories">
          <h2>Browse by category</h2>
          <ul>
            {CURATED_CATEGORIES.map(category => (
              <li key={category.slug}>
                <Link href={`/categories/${category.slug}`}>
                  <strong>{category.title}</strong>
                  <span>{category.packages.join(', ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </ResultLayout>
  )
}
