import React from 'react'
import SimilarPackageCard from '../../../../../client/components/SimilarPackageCard/SimilarPackageCard'
import { PackageInfo } from '../../../../../types'

interface SimilarPackagesSectionProps {
  packs: PackageInfo[]
  category: string
  comparisonGzip: number
}

const SimilarPackagesSection: React.FC<SimilarPackagesSectionProps> = ({
  packs,
  category,
  comparisonGzip,
}) => {
  return (
    <div className="similar-packages-section">
      <h2 className="result__section-heading similar-packages-section__heading">
        {' '}
        Similar Packages{' '}
      </h2>
      <h5 className="similar-packages-section__subheading"> {category} </h5>

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

export default SimilarPackagesSection
