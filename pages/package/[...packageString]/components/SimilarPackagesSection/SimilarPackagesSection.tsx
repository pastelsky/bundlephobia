import React from 'react'
import Link from 'next/link'

import { type PackageBuildInfo } from '../../../../../client/api'
import SimilarPackageCard from '../../../../../client/components/SimilarPackageCard/SimilarPackageCard'

type SimilarPackagesSectionProps = {
  packageName: string
  packs: PackageBuildInfo[]
  category: string
  comparisonGzip: number
}

export default function SimilarPackagesSection({
  packs,
  category,
  comparisonGzip,
  packageName,
}: SimilarPackagesSectionProps) {
  const comparisonPackages = [
    ...new Set([packageName, ...packs.map(pack => pack.name)]),
  ].slice(0, 5)

  const comparisonPath = `/trends?packages=${comparisonPackages.map(encodeURIComponent).join('~vs~')}`

  return (
    <div className="similar-packages-section">
      <h2 className="result__section-heading similar-packages-section__heading">
        Similar Packages
      </h2>

      <div className="similar-packages-section__bar">
        <span className="similar-packages-section__category-name">
          {category}
        </span>

        <Link
          href={comparisonPath}
          className="similar-packages-section__compare"
          title="Compare downloads, GitHub stars, and size history"
        >
          Compare trends
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="similar-packages-section__list">
        {packs.map(pack => (
          <SimilarPackageCard
            key={pack.name}
            pack={pack}
            comparisonSizePercent={
              ((pack.gzip - comparisonGzip) / comparisonGzip) * 100
            }
          />
        ))}
        <SimilarPackageCard category={category} isEmpty />
      </div>
    </div>
  )
}
