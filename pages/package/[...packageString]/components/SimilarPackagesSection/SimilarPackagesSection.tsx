import React, { Component } from 'react'
import Link from 'next/link'

import { type PackageBuildInfo } from '../../../../../client/api'
import SimilarPackageCard from '../../../../../client/components/SimilarPackageCard/SimilarPackageCard'

type SimilarPackagesSectionProps = {
  packageName: string
  packs: PackageBuildInfo[]
  category: string
  comparisonGzip: number
}

class SimilarPackagesSection extends Component<SimilarPackagesSectionProps> {
  render() {
    const { packs, category, comparisonGzip, packageName } = this.props

    const comparisonPackages = [
      ...new Set([packageName, ...packs.map(pack => pack.name)]),
    ].slice(0, 5)

    const comparisonPath = `/trends?packages=${comparisonPackages.map(encodeURIComponent).join('~vs~')}`

    return (
      <div className="similar-packages-section">
        <h2 className="result__section-heading similar-packages-section__heading">
          {' '}
          Similar Packages{' '}
        </h2>
        <p className="similar-packages-section__subheading">
          <span>{category}</span>
          <Link
            href={comparisonPath}
            className="similar-packages-section__compare"
            title="Compare downloads, GitHub stars, and size history"
          >
            Compare trends
          </Link>
        </p>

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
}

export default SimilarPackagesSection
