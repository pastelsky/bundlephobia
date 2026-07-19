import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next'
import React from 'react'

import CuratedPackagePage from '../../client/components/CuratedPackagePage'
import {
  CURATED_CATEGORIES,
  CURATED_COMPARISONS,
  findCuratedComparison,
} from '../../seo/curated-content'
import { getPackageFactsBatch } from '../../server/seo/packageFacts'

export default function ComparisonPage({
  comparison,
  packages,
  relatedPages,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <CuratedPackagePage
      kind="comparison"
      title={comparison.title}
      description={comparison.description}
      canonicalPath={`/compare/${comparison.slug}`}
      packages={packages}
      guidance={comparison.guidance}
      relatedPages={relatedPages}
    />
  )
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const slug = String(context.params?.slug ?? '')
  const comparison = findCuratedComparison(slug)

  if (!comparison) return { notFound: true as const }

  context.res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=86400'
  )

  const packages = await getPackageFactsBatch(comparison.packages)
  const relatedPages = [
    ...CURATED_COMPARISONS.filter(item => item.slug !== comparison.slug)
      .slice(0, 3)
      .map(item => ({ href: `/compare/${item.slug}`, label: item.title })),
    ...CURATED_CATEGORIES.filter(category =>
      category.packages.some(name => comparison.packages.includes(name))
    )
      .slice(0, 1)
      .map(category => ({
        href: `/categories/${category.slug}`,
        label: category.title,
      })),
  ]

  return { props: { comparison, packages, relatedPages } }
}
