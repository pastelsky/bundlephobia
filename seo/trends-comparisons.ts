import { categories, comparisonGroups } from '../utils/similarPackages'

function deriveComparisons() {
  const pairs = new Map<string, string[]>()

  const groups = [
    ...comparisonGroups.map(group => group.packages),
    ...Object.values(categories).map(category => category.similar),
  ]

  for (const packages of groups) {
    const peers = [...new Set(packages)]

    peers.forEach((name, index) => {
      for (const peer of peers.slice(index + 1)) {
        const key = [name, peer].sort().join('~vs~')

        if (!pairs.has(key)) pairs.set(key, [name, peer])
      }
    })
  }

  return [...pairs.values()]
}

export const trendsComparisons = deriveComparisons()

export function trendsComparisonPath(packages: readonly string[]) {
  return `/trends?packages=${packages.map(encodeURIComponent).join('~vs~')}`
}

export function findTrendsComparison(packages: readonly string[]) {
  return trendsComparisons.find(
    comparison =>
      comparison.length === packages.length &&
      comparison.every(name => packages.includes(name)),
  )
}
