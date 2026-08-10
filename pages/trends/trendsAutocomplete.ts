import API, {
  sortSuggestionsBySearchScore,
  type PackageSuggestion,
} from '../../client/api'

const MAX_RELATED_PACKAGES = 5

export function rankSuggestionsByQuery(
  suggestions: PackageSuggestion[],
  query: string
) {
  const normalizedQuery = query.toLowerCase()
  const uniqueSuggestions = new Map<string, PackageSuggestion>()

  suggestions.forEach(suggestion => {
    const packageName = suggestion.package.name.toLowerCase()
    if (!uniqueSuggestions.has(packageName)) {
      uniqueSuggestions.set(packageName, suggestion)
    }
  })

  return Array.from(uniqueSuggestions.values())
    .filter(suggestion =>
      suggestion.package.name.toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) => {
      // A direct match is more useful than a package that merely contains the
      // typed name, regardless of its score.
      const aStartsWithQuery = a.package.name
        .toLowerCase()
        .startsWith(normalizedQuery)
      const bStartsWithQuery = b.package.name
        .toLowerCase()
        .startsWith(normalizedQuery)

      if (aStartsWithQuery !== bStartsWithQuery) {
        return aStartsWithQuery ? -1 : 1
      }

      return sortSuggestionsBySearchScore(a, b)
    })
}

export async function loadRelatedPackageSuggestions(
  query: string,
  relatedPackageNames: string[]
) {
  // Related packages expand discovery, but keep the request fan-out bounded
  // while a user is typing.
  const queries = [query, ...relatedPackageNames]
    .filter(Boolean)
    .slice(0, MAX_RELATED_PACKAGES + 1)
  const results = await Promise.allSettled(
    queries.map(packageName => API.getSuggestions(packageName))
  )

  // A failed related lookup should not hide suggestions from successful ones.
  return rankSuggestionsByQuery(
    results.flatMap(result =>
      result.status === 'fulfilled' ? result.value : []
    ),
    query
  )
}
