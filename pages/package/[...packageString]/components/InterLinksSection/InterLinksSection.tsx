import React, { useEffect, useState } from 'react'

import API, { type PackageSuggestion } from '../../../../../client/api'
import {
  daysFromToday,
  parsePackageString,
} from '../../../../../utils/common.utils'
import InterLinksSectionCard from './InterLinksSectionCard'

type InterLinksSectionProps = {
  packageName: string
}

function usePackagesFromSameScope(packageName: string) {
  const { scope } = parsePackageString(packageName)
  const [morePackages, setMorePackages] = useState<PackageSuggestion[]>([])

  useEffect(() => {
    if (!scope) {
      setMorePackages([])
      return
    }

    const getAgeScore = (result: PackageSuggestion) =>
      result.package.date
        ? Math.min(1 / Math.log(daysFromToday(result.package.date)), 1)
        : 0

    API.getSuggestions(`@${scope}`).then(results => {
      const sorted = results
        .filter(result => result.package.scope === scope)
        .filter(result => result.package.name !== packageName)
        .sort(
          (packageA, packageB) =>
            packageB.score.detail.popularity * getAgeScore(packageB) -
            packageA.score.detail.popularity * getAgeScore(packageA)
        )

      setMorePackages(sorted)
    })
  }, [packageName, scope])

  return morePackages
}

export default function InterLinksSection({
  packageName,
}: InterLinksSectionProps) {
  const { scope } = parsePackageString(packageName)
  const morePackages = usePackagesFromSameScope(packageName)

  if (!scope || !morePackages.length) {
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
              date={pack.package.date ?? new Date().toISOString()}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
