import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next'
import React from 'react'

import CuratedPackagePage from '../../client/components/CuratedPackagePage'
import {
  CURATED_CATEGORIES,
  CURATED_COMPARISONS,
  findCuratedCategory,
} from '../../seo/curated-content'
import { getCuratedPackageFactsBatch } from '../../server/seo/curatedPackageFacts'

export default function CategoryPage({
  category,
  packages,
  relatedPages,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <CuratedPackagePage
      kind="category"
      title={category.title}
      description={category.description}
      canonicalPath={`/categories/${category.slug}`}
      packages={packages}
      relatedPages={relatedPages}
    />
  )
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const slug = String(context.params?.slug ?? '')
  const category = findCuratedCategory(slug)

  if (!category) return { notFound: true as const }

  context.res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=86400'
  )

  const packages = await getCuratedPackageFactsBatch(category.packages)
  const relatedPages = [
    ...CURATED_COMPARISONS.filter(comparison =>
      comparison.packages.some(name => category.packages.includes(name))
    )
      .slice(0, 3)
      .map(comparison => ({
        href: `/compare/${comparison.slug}`,
        label: comparison.title,
      })),
    ...CURATED_CATEGORIES.filter(item => item.slug !== category.slug)
      .slice(0, 2)
      .map(item => ({ href: `/categories/${item.slug}`, label: item.title })),
  ]

  return { props: { category, packages, relatedPages } }
}
