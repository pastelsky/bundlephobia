import fetch from 'unfetch'

type PackageSuggestion = {
  searchScore: number
  score: { detail: { popularity: number } }
}

type RecentSearch = {
  [key: string]: {
    name: string
    version: string
    lastSearched: number
    count: number
  }
}

export default class API {
  static get<T = unknown>(url: string, isInternal = true): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (isInternal) {
      headers['X-Bundlephobia-User'] = 'bundlephobia website'
    }
    return fetch(url, { headers }).then(res => {
      if (!res.ok) {
        try {
          return res.json().then(err => Promise.reject(err))
        } catch (e) {
          if (res.status === 503) {
            return Promise.reject({
              error: {
                code: 'TimeoutError',
                message:
                  'This is taking unusually long. Check back in a couple of minutes?',
              },
            })
          }

          return Promise.reject({
            error: {
              code: 'BuildError',
              message:
                "Oops, something went wrong and we don't have an appropriate error for this. Open an issue maybe?",
            },
          })
        }
      }
      return res.json()
    })
  }

  static getInfo(packageString: string) {
    return API.get<any>(`/api/size?package=${packageString}&record=true`)
  }

  static getExports(packageString: string) {
    return API.get(`/api/exports?package=${packageString}`)
  }

  static getExportsSizes(packageString: string) {
    return API.get(`/api/exports-sizes?package=${packageString}`)
  }

  static getHistory(packageString: string) {
    return API.get(`/api/package-history?package=${packageString}`)
  }

  static getRecentSearches(limit: number) {
    return API.get<RecentSearch[]>(`/api/recent?limit=${limit}`)
  }

  static getSimilar(packageName: string) {
    return API.get(`/api/similar-packages?package=${packageName}`)
  }

  static getSuggestions(query: string) {
    const suggestionSort = (
      packageA: PackageSuggestion,
      packageB: PackageSuggestion
    ) => {
      // Rank closely matching packages followed
      // by most popular ones
      if (
        Math.abs(
          Math.log(packageB.searchScore) - Math.log(packageA.searchScore)
        ) > 1
      ) {
        return packageB.searchScore - packageA.searchScore
      } else {
        return (
          packageB.score.detail.popularity - packageA.score.detail.popularity
        )
      }
    }

    return API.get<PackageSuggestion[]>(
      `https://api.npms.io/v2/search/suggestions?q=${query}`,
      false
    ).then(result => result.sort(suggestionSort))

    //backup when npms.io is down

    //return API.get(`/-/search?text=${query}`)
    //  .then(result => result.objects
    //    .sort(suggestionSort)
    //    .map(suggestion => {
    //      const name = suggestion.package.name
    //      const hasMatch = name.includes(query)
    //      const startIndex = name.indexOf(query)
    //      const endIndex = startIndex + query.length
    //      let highlight
    //
    //      if (hasMatch) {
    //        highlight =
    //          name.substring(0, startIndex) +
    //          '<em>' + name.substring(startIndex, endIndex) + '</em>' +
    //          name.substring(endIndex)
    //      } else {
    //        highlight = name
    //      }
    //
    //      return {
    //        ...suggestion,
    //        highlight,
    //      }
    //    }),
    //  )
  }
}
