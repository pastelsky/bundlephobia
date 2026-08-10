import type { SimilarPackagesResponse } from '../client/api'

type ComparisonGroup = {
  packages: string[]
}

export const TRUSTED_SIMILARITY_SCORE = 12
export const RECOMMENDATION_SCORE_FLOOR = 44
export const DEFAULT_RECOMMENDATION_LIMIT = 10

// Broad, foundational packages need a purpose-level peer set. A token classifier
// cannot reliably distinguish a framework from the plugins built for it.
const comparisonGroups: ComparisonGroup[] = [
  {
    packages: [
      'react',
      'preact',
      'vue',
      'svelte',
      'solid-js',
      '@angular/core',
      'lit',
    ],
  },
  { packages: ['express', 'fastify', 'koa', 'hono', '@nestjs/core'] },
  { packages: ['vite', 'webpack', 'rollup', 'esbuild', 'parcel'] },
  { packages: ['jest', 'vitest', 'ava', 'mocha'] },
  { packages: ['redux', 'zustand', 'jotai', 'mobx', 'recoil'] },
  { packages: ['date-fns', 'dayjs', 'luxon', 'moment'] },
]

type RecommendationInput = {
  packages: string[]
  similarResults: Array<SimilarPackagesResponse | null>
  limit?: number
}

export function getTrendsRecommendations({
  packages,
  similarResults,
  limit = DEFAULT_RECOMMENDATION_LIMIT,
}: RecommendationInput) {
  const selected = new Set(
    packages.map(packageName => packageName.toLowerCase())
  )
  const scores = new Map<string, { name: string; score: number }>()

  const add = (packageName: string, score: number) => {
    const normalized = packageName.toLowerCase()
    if (!normalized || selected.has(normalized)) return
    const existing = scores.get(normalized)
    if (!existing || score > existing.score) {
      scores.set(normalized, { name: packageName, score })
    }
  }

  comparisonGroups.forEach(group => {
    const selectedPeers = group.packages.filter(packageName =>
      selected.has(packageName.toLowerCase())
    )
    if (selectedPeers.length === 0) return

    group.packages.forEach((packageName, index) => {
      // Multiple selected peers make the remaining alternatives more useful,
      // while group order keeps the hand-curated comparison set predictable.
      add(packageName, 100 + selectedPeers.length * 10 - index / 100)
    })
  })

  similarResults.forEach(result => {
    if (!result || result.category.score < TRUSTED_SIMILARITY_SCORE) return
    // Keep walking down the ranked similar-package list, but stop when the
    // confidence-adjusted rank falls below the relevance floor. This gives
    // the UI a deeper pool without allowing the tail of a weak classifier
    // match to become a recommendation.
    const categoryScore = Math.min(result.category.score, 300)
    const categoryBaseScore = Math.min(80, 50 + categoryScore / 10)
    result.category.similar.forEach((packageName, index) => {
      const candidateScore = categoryBaseScore - index
      if (candidateScore >= RECOMMENDATION_SCORE_FLOOR) {
        add(packageName, candidateScore)
      }
    })
  })

  const recommendations = Array.from(scores.values())
    .sort((candidateA, candidateB) =>
      candidateB.score === candidateA.score
        ? candidateA.name.localeCompare(candidateB.name)
        : candidateB.score - candidateA.score
    )
    .map(({ name }) => name)
    .slice(0, limit)

  return {
    recommendations,
    // These confidence-filtered names improve autocomplete recall without
    // leaking classifier tags such as “animation” into framework suggestions.
    autocompleteQueries: recommendations,
  }
}
