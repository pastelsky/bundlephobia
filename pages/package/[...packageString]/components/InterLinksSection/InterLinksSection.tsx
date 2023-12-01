import React, { useEffect, useState } from 'react'
import {
  parsePackageString,
  daysFromToday,
} from '../../../../../utils/common.utils'
import API from '../../../../../client/api'
import InterLinksSectionCard from './InterLinksSectionCard'
import { PackageSuggestion } from '../../../../../types'

function usePackagesFromSameScope(packageName: string) {
  const { scope } = parsePackageString(packageName)

  const [morePackages, setMorePackages] = useState<PackageSuggestion[]>([])
  const getAgeScore = (result: PackageSuggestion) =>
    Math.min(1 / Math.log(daysFromToday(result.package.date)), 1)

  useEffect(() => {
    API.getSuggestions(`@${scope}`).then(results => {
      const sorted = results
        .filter(result => result.package.scope === scope)
        .filter(result => result.package.name !== packageName)
        .sort(
          (rA, rB) =>
            rB.score.detail.popularity * getAgeScore(rB) -
            rA.score.detail.popularity * getAgeScore(rA)
        )
      setMorePackages(sorted)
    })
  }, [packageName])
  return morePackages
}

interface InterLinksSectionProps {
  packageName: string
}

const InterLinksSection: React.FC<InterLinksSectionProps> = props => {
  const { scope } = parsePackageString(props.packageName)
  const morePackages = usePackagesFromSameScope(props.packageName)

  if (!morePackages.length) {
    return null
  }

  return (
    <div className="content-container">
      <div className="interlinks-section">
        <h2 className="result__section-heading result__section-heading--new">
          More &nbsp;<code>{scope}</code> &nbsp;packages
        </h2>
        <div className="interlinks-section__list">
          {morePackages.map(pack => (
            <InterLinksSectionCard
              key={pack.package.name}
              name={pack.package.name}
              description={pack.package.description}
              date={pack.package.date}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default InterLinksSection
