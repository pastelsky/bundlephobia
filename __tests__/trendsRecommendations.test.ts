import { getTrendsRecommendations } from '../utils/trendsRecommendations'

const similar = (score: number, packages: string[]) => ({
  category: { score, similar: packages },
})

describe('trends recommendations', () => {
  it('uses framework peers instead of a low-confidence plugin category', () => {
    expect(
      getTrendsRecommendations({
        packages: ['react'],
        similarResults: [
          similar(5, ['react-spring', 'framer-motion', 'react-motion']),
        ],
      }).recommendations
    ).toEqual(['preact', 'vue', 'svelte', 'solid-js', '@angular/core', 'lit'])
  })

  it('uses the curated similar-package list when classification is confident', () => {
    expect(
      getTrendsRecommendations({
        packages: ['clsx'],
        similarResults: [similar(999, ['classnames', 'classcat'])],
      }).recommendations
    ).toEqual(['classnames', 'classcat'])
  })

  it('removes already selected packages across all candidate sources', () => {
    expect(
      getTrendsRecommendations({
        packages: ['react', 'vue'],
        similarResults: [similar(5, ['framer-motion']), null],
      }).recommendations
    ).toEqual(['preact', 'svelte', 'solid-js', '@angular/core', 'lit'])
  })

  it('withholds low-confidence matches when no purposeful peer group exists', () => {
    expect(
      getTrendsRecommendations({
        packages: ['an-obscure-package'],
        similarResults: [similar(11, ['unrelated-plugin'])],
      }).recommendations
    ).toEqual([])
  })

  it('keeps lower-ranked candidates above the relevance floor', () => {
    const candidates = Array.from({ length: 12 }, (_, index) => `peer-${index}`)
    expect(
      getTrendsRecommendations({
        packages: ['source-package'],
        similarResults: [similar(120, candidates)],
      }).recommendations
    ).toEqual(candidates.slice(0, 10))
  })
})
