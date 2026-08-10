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
  const queries = [query, ...relatedPackageNames]
    .filter(Boolean)
    .slice(0, MAX_RELATED_PACKAGES + 1)
  const results = await Promise.allSettled(
    queries.map(packageName => API.getSuggestions(packageName))
  )

  return rankSuggestionsByQuery(
    results.flatMap(result =>
      result.status === 'fulfilled' ? result.value : []
    ),
    query
  )
}
