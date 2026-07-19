import Link from 'next/link'
import React from 'react'

import MetaTags from '../../client/components/MetaTags'
import ResultLayout from '../../client/components/ResultLayout'
import { CURATED_CATEGORIES } from '../../seo/curated-content'

export default function CategoriesIndexPage() {
  return (
    <ResultLayout className="curated-page">
      <MetaTags
        title="Browse npm packages by category | Bundlephobia"
        description="Explore curated npm package categories and compare bundle size, gzip size, dependencies, and module support."
        canonicalPath="/categories"
      />
      <main className="curated-page__main">
        <header className="curated-page__intro">
          <p className="curated-page__eyebrow">Package categories</p>
          <h1>Browse packages by frontend task</h1>
          <p>
            Explore a small set of established alternatives before choosing a
            new dependency.
          </p>
        </header>

        <nav className="curated-index" aria-label="Package categories">
          <ul>
            {CURATED_CATEGORIES.map(category => (
              <li key={category.slug}>
                <Link href={`/categories/${category.slug}`}>
                  <strong>{category.title}</strong>
                  <span>{category.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </ResultLayout>
  )
}
