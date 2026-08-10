import type { PackageSuggestion } from '../client/api'
import { rankSuggestionsByQuery } from '../pages/trends/trendsAutocomplete'

const suggestion = (name: string, searchScore: number): PackageSuggestion => ({
  package: { name, description: '' },
  searchScore,
  score: { detail: { popularity: searchScore } },
})

it('ranks matching suggestions by query before search score', () => {
  expect(
    rankSuggestionsByQuery(
      [
        suggestion('preact', 100),
        suggestion('react-dom', 75),
        suggestion('React', 100),
        suggestion('react', 20),
        suggestion('not-a-match', 500),
      ],
      'react'
    ).map(item => item.package.name)
  ).toEqual(['React', 'react-dom', 'preact'])
})
