import Link from 'next/link'
import React from 'react'

import type { PackageFacts } from '../../../server/seo/packageFacts'
import { formatSize } from '../../../utils'
import MetaTags from '../MetaTags'
import ResultLayout from '../ResultLayout'

type RelatedPage = {
  href: string
  label: string
}

type CuratedPackagePageProps = {
  kind: 'category' | 'comparison'
  title: string
  description: string
  canonicalPath: string
  packages: PackageFacts[]
  guidance?: string
  relatedPages: RelatedPage[]
}

function formatBytes(value: number) {
  const formatted = formatSize(value)
  return `${formatted.size.toFixed(1)} ${formatted.unit}`
}

export default function CuratedPackagePage({
  kind,
  title,
  description,
  canonicalPath,
  packages,
  guidance,
  relatedPages,
}: CuratedPackagePageProps) {
  return (
    <ResultLayout className="curated-page">
      <MetaTags
        title={`${title}: bundle size comparison | Bundlephobia`}
        description={description}
        canonicalPath={canonicalPath}
      />
      <main className="curated-page__main">
        <nav className="curated-page__breadcrumb" aria-label="Breadcrumb">
          <Link href={kind === 'comparison' ? '/compare' : '/categories'}>
            {kind === 'comparison' ? 'Comparisons' : 'Categories'}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>

        <header className="curated-page__intro">
          <p className="curated-page__eyebrow">
            {kind === 'comparison' ? 'Package comparison' : 'Package category'}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>

        <div className="curated-page__table-wrap">
          <table className="curated-page__table">
            <caption>
              Latest cached Bundlephobia analysis. Missing measurements never
              trigger a build from this page.
            </caption>
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">Minified</th>
                <th scope="col">Gzip</th>
                <th scope="col">Dependencies</th>
                <th scope="col">Module</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(pack => {
                const result = pack.result
                const hasModule = Boolean(
                  result?.hasJSModule ||
                    result?.hasJSNext ||
                    result?.isModuleType
                )

                return (
                  <tr key={pack.name}>
                    <th scope="row">
                      <Link href={`/package/${pack.name}`}>{pack.name}</Link>
                      {pack.description && <small>{pack.description}</small>}
                    </th>
                    <td data-label="Minified">
                      {result ? formatBytes(result.size) : 'Not cached'}
                    </td>
                    <td data-label="Gzip">
                      {result ? formatBytes(result.gzip) : 'Not cached'}
                    </td>
                    <td data-label="Dependencies">
                      {result ? result.dependencyCount : 'Unknown'}
                    </td>
                    <td data-label="Module">
                      {result ? (hasModule ? 'Yes' : 'No signal') : 'Unknown'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {guidance && (
          <section className="curated-page__guidance">
            <h2>How to use this comparison</h2>
            <p>{guidance}</p>
          </section>
        )}

        <nav className="curated-page__related" aria-label="Related pages">
          <h2>Related package guides</h2>
          <ul>
            {relatedPages.map(page => (
              <li key={page.href}>
                <Link href={page.href}>{page.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </ResultLayout>
  )
}
