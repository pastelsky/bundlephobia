import fetch from 'unfetch'

import type {
  PackageBuildInfo,
  PackageBuildInfoSnapshot,
  PackageExportAsset,
  PackageIdentity,
} from '../types/package-domain'

// Re-export domain types that client code imports from this module.
export type { PackageBuildInfo, PackageBuildInfoSnapshot, PackageExportAsset }

export type PackageHistoryResponse = Record<string, PackageBuildInfoSnapshot>

/** A single npm-search suggestion returned by the npms.io API. */
export type PackageSuggestion = {
  package: {
    name: string
    description: string
    scope?: string
    date?: string
  }
  searchScore: number
  score: { detail: { popularity: number } }
  highlight?: string
}

export type RecentSearch = {
  [key: string]: {
    name: string
    version: string
    lastSearched: number
    count: number
  }
}

/** Package name + version pair used in the dependencies endpoint. */
export type PackageDependencyInfo = PackageIdentity

export type SimilarPackagesResponse = {
  category: {
    label?: string
    score: number
    similar: string[]
  }
}

export type PackageExportsResponse = {
  exports: Record<string, string>
}

export type PackageExportSizesResponse = {
  assets: PackageExportAsset[]
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

  static post<T = unknown>(
    url: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Bundlephobia-User': 'bundlephobia website',
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).then(res => {
      if (!res.ok) {
        try {
          return res.json().then(err => Promise.reject(err))
        } catch (e) {
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
    return API.get<PackageBuildInfo>(
      `/api/size?package=${packageString}&record=true`
    )
  }

  static getExports(packageString: string) {
    return API.get<PackageExportsResponse>(
      `/api/exports?package=${packageString}`
    )
  }

  static getExportsSizes(packageString: string) {
    return API.get<PackageExportSizesResponse>(
      `/api/exports-sizes?package=${packageString}`
    )
  }

  static getDependencies(packageString: string) {
    return API.get<PackageDependencyInfo[]>(
      `/api/dependencies?package=${packageString}`
    )
  }

  static getHistory(packageString: string, limit: number) {
    return API.get<PackageHistoryResponse>(
      `/api/package-history?package=${packageString}&limit=${limit}`
    )
  }

  static getRecentSearches(limit: number) {
    return API.get<RecentSearch>(`/api/recent?limit=${limit}`)
  }

  static getSimilar(packageName: string) {
    return API.get<SimilarPackagesResponse>(
      `/api/similar-packages?package=${packageName}`
    )
  }

  static getSuggestions(query: string) {
    const suggestionSort = (
      packageA: PackageSuggestion,
      packageB: PackageSuggestion
    ) => {
      // Rank closely matching packages followed by most popular ones.
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
  }
}
