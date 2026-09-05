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

export function sortSuggestionsBySearchScore(
  packageA: PackageSuggestion,
  packageB: PackageSuggestion
) {
  if (
    Math.abs(Math.log(packageB.searchScore) - Math.log(packageA.searchScore)) >
    1
  ) {
    return packageB.searchScore - packageA.searchScore
  }

  return packageB.score.detail.popularity - packageA.score.detail.popularity
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
    tags?: Array<{ tag: string; weight: number }>
    similar: string[]
  }
}

export type TrendsMetric = 'downloads' | 'stars' | 'size'
export type TrendsRange = 'last-2-months' | 'last-year' | 'last-3-years'
export type TrendsGroupBy = 'day' | 'week' | 'month'

export type TrendsPoint = {
  date: string
  value: number
  version?: string
  partial?: boolean
}

export type TrendsRelease = {
  version: string
  date: string
  major: boolean
  minor: boolean
}

export type TrendsPackageSeries = {
  name: string
  repository: string | null
  downloads: TrendsPoint[]
  stars: TrendsPoint[]
  size: TrendsPoint[]
  releases: TrendsRelease[]
  current: {
    weeklyDownloads: number | null
    stars: number | null
    gzip: number | null
    size: number | null
  }
  warnings: string[]
}

export type TrendsResponse = {
  packages: TrendsPackageSeries[]
  range: TrendsRange
  groupBy: TrendsGroupBy
  generatedAt: string
}

export type PackageExportsResponse = {
  exports: Record<string, string>
}

export type PackageExportSizesResponse = {
  assets: PackageExportAsset[]
}

type APIResponse = Awaited<ReturnType<typeof fetch>>

const getFallbackError = (status: number) => {
  if (status === 502 || status === 503) {
    return {
      error: {
        code: 'ServiceUnavailableError',
        message:
          'The build service is temporarily unavailable. Please try again in a few minutes.',
      },
    }
  }

  return {
    error: {
      code: 'BuildError',
      message:
        "Oops, something went wrong and we don't have an appropriate error for this. Open an issue maybe?",
    },
  }
}

async function parseResponse<T>(response: APIResponse): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>
  }

  let error: unknown
  try {
    error = await response.json()
  } catch {
    throw getFallbackError(response.status)
  }

  throw error
}

export default class API {
  static get<T = unknown>(url: string, isInternal = true): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (isInternal) {
      headers['X-Bundlephobia-User'] = 'bundlephobia website'
    }
    return fetch(url, { headers }).then(parseResponse<T>)
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
    }).then(parseResponse<T>)
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

  static getTrends(
    packages: string[],
    range: TrendsRange,
    groupBy: TrendsGroupBy
  ) {
    const packageQuery = packages.map(encodeURIComponent).join(',')
    return API.get<TrendsResponse>(
      `/api/trends?packages=${packageQuery}&range=${encodeURIComponent(
        range
      )}&groupBy=${encodeURIComponent(groupBy)}`
    )
  }

  static getSuggestions(query: string) {
    return API.get<PackageSuggestion[]>(
      `https://api.npms.io/v2/search/suggestions?q=${query}`,
      false
    ).then(result => result.sort(sortSuggestionsBySearchScore))
  }
}
