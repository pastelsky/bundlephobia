import fetch from 'unfetch'

import type {
  PackageBuildInfo,
  PackageBuildInfoSnapshot,
  PackageExportAsset,
  PackageIdentity,
} from '@bundlephobia/service-contracts/package'
import type { JsonObject } from '../types/json'
import type { PackageHistoryResponse } from '../types/package-history'
import type {
  TrendsGroupBy,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'

// Re-export domain types that client code imports from this module.
export type { PackageBuildInfo, PackageBuildInfoSnapshot, PackageExportAsset }

export type { PackageHistoryResponse }

export type { TrendsGroupBy, TrendsRange, TrendsResponse }

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
  packageB: PackageSuggestion,
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
    similar: string[]
  }
}

export type PackageExportsResponse = {
  exports: Record<string, string>
}

export type PackageExportSizesResponse = {
  assets: PackageExportAsset[]
}

type APIResponse = Awaited<ReturnType<typeof fetch>>

type FetchImplementation = typeof fetch

let fetchImplementation: FetchImplementation = fetch

export function setFetchImplementation(
  implementation: FetchImplementation,
): () => void {
  const previous = fetchImplementation
  fetchImplementation = implementation

  return () => {
    fetchImplementation = previous
  }
}

type APIHeaders = {
  Accept: string
  'Content-Type'?: string
  'X-Bundlephobia-User'?: string
}

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
    // SAFETY: API callers supply the response contract at each typed call site.
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
    const headers: APIHeaders = {
      Accept: 'application/json',
    }

    if (isInternal) {
      headers['X-Bundlephobia-User'] = 'bundlephobia website'
    }

    return fetchImplementation(url, { headers }).then(parseResponse<T>)
  }

  static post<T = unknown>(url: string, body: JsonObject): Promise<T> {
    const headers: APIHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Bundlephobia-User': 'bundlephobia website',
    }

    return fetchImplementation(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).then(parseResponse<T>)
  }

  static getInfo(packageString: string) {
    return API.get<PackageBuildInfo>(
      `/api/size?package=${packageString}&record=true`,
    )
  }

  static getExports(packageString: string) {
    return API.get<PackageExportsResponse>(
      `/api/exports?package=${packageString}`,
    )
  }

  static getExportsSizes(packageString: string) {
    return API.get<PackageExportSizesResponse>(
      `/api/exports-sizes?package=${packageString}`,
    )
  }

  static getDependencies(packageString: string) {
    return API.get<PackageDependencyInfo[]>(
      `/api/dependencies?package=${packageString}`,
    )
  }

  static getHistory(
    packageName: string,
    options: { from?: string; to?: string; limit?: number } = {},
  ) {
    const params = new URLSearchParams({ package: packageName })

    if (options.from) params.set('from', options.from)

    if (options.to) params.set('to', options.to)

    if (options.limit) params.set('limit', String(options.limit))

    return API.get<PackageHistoryResponse>(`/api/package-history?${params}`)
  }

  static getTrends(
    packages: string[],
    range: TrendsRange,
    groupBy: TrendsGroupBy,
  ) {
    const params = new URLSearchParams({
      packages: packages.join(','),
      range,
      groupBy,
    })

    return API.get<TrendsResponse>(`/api/trends?${params}`)
  }

  static getRecentSearches(limit: number) {
    return API.get<RecentSearch>(`/api/recent?limit=${limit}`)
  }

  static getSimilar(packageName: string) {
    return API.get<SimilarPackagesResponse>(
      `/api/similar-packages?package=${packageName}`,
    )
  }

  static getSuggestions(query: string) {
    return API.get<PackageSuggestion[]>(
      `https://api.npms.io/v2/search/suggestions?q=${query}`,
      false,
    ).then(result => result.sort(sortSuggestionsBySearchScore))
  }
}
