import { categories } from '../utils/similarPackages'
import { trendsComparisonCanonicalPath } from './trends-comparisons'

export type TrendsCategory = {
  id: string
  title: string
  packages: string[]
  popularPairs: Array<[string, string]>
}

function derivePairs(
  packages: readonly string[],
  maxPairs = 4,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []

  for (let i = 0; i < packages.length && pairs.length < maxPairs; i++) {
    for (let j = i + 1; j < packages.length && pairs.length < maxPairs; j++) {
      pairs.push([packages[i], packages[j]])
    }
  }

  return pairs
}

export const TRENDS_CATEGORIES: TrendsCategory[] = Object.entries(categories)
  .map(([id, category]) => ({
    id,
    title: category.name,
    packages: category.similar,
    popularPairs: derivePairs(category.similar),
  }))
  .filter(category => category.packages.length >= 2)

export function getCategoryCompareAllPath(category: TrendsCategory) {
  return trendsComparisonCanonicalPath(category.packages.slice(0, 5))
}
