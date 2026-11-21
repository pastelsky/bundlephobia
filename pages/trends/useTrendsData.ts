import { useCallback, useEffect, useState } from 'react'

import Analytics from '../../client/analytics'
import API, {
  type TrendsGroupBy,
  type TrendsMetric,
  type TrendsRange,
  type TrendsResponse,
} from '../../client/api'
import {
  fetchTrendsDownloads,
  getCachedPackageDownloads,
  type PackageDownloadsResult,
} from './trendsDownloadsClient'

type TrendsLoadState =
  | { status: 'empty'; data: null }
  | { status: 'pending'; data: TrendsResponse | null; showLoading: boolean }
  | { status: 'ready'; data: TrendsResponse; requestKey: string }
  | { status: 'error'; data: TrendsResponse | null; message: string }

function mergeDownloadsIntoTrendsResponse(
  serverRes: TrendsResponse,
  clientDownloads: Map<string, PackageDownloadsResult>,
): TrendsResponse {
  return {
    ...serverRes,
    packages: serverRes.packages.map(pack => {
      // Preserve server-supplied downloads when present (for instance in mocked tests)
      if (pack.downloads.length > 0) return pack

      const clientResult = clientDownloads.get(pack.name)

      if (!clientResult) return pack

      const warnings =
        clientResult.warning && !pack.warnings.includes(clientResult.warning)
          ? [...pack.warnings, clientResult.warning]
          : pack.warnings

      return {
        ...pack,
        downloads: clientResult.downloads,
        current: {
          ...pack.current,
          weeklyDownloads:
            pack.current.weeklyDownloads ?? clientResult.weeklyDownloads,
        },
        warnings,
      }
    }),
  }
}

function trackTrendsLoad(
  response: TrendsResponse,
  context: { packageCount: number; range: TrendsRange; startedAt: number },
) {
  Analytics.trendsDataLoaded({
    packageCount: context.packageCount,
    range: context.range,
    timeTaken: Math.round(performance.now() - context.startedAt),
    downloadPackageCount: response.packages.filter(
      pack => pack.downloads.length > 0,
    ).length,
    starsPackageCount: response.packages.filter(pack => pack.stars.length > 0)
      .length,
    sizePackageCount: response.packages.filter(pack => pack.size.length > 0)
      .length,
    warningPackageCount: response.packages.filter(
      pack => pack.warnings.length > 0,
    ).length,
  })
}

export function useTrendsData({
  packages,
  metric,
  range,
  groupBy,
}: {
  packages: string[]
  metric: TrendsMetric
  range: TrendsRange
  groupBy: TrendsGroupBy
}) {
  const [loadState, setLoadState] = useState<TrendsLoadState>({
    status: 'pending',
    data: null,
    showLoading: true,
  })

  const requestKey = JSON.stringify([packages, range])

  const startLoading = useCallback(() => {
    setLoadState(current => ({
      status: 'pending',
      data: current.data,
      showLoading: false,
    }))
  }, [])

  useEffect(() => {
    if (loadState.status !== 'ready' || loadState.requestKey !== requestKey) {
      return
    }

    Analytics.trendsComparisonViewed({
      packageCount: packages.length,
      metric,
      range,
      groupBy,
      dataPackageCount: loadState.data.packages.filter(
        pack => pack[metric].length > 0,
      ).length,
      warningPackageCount: loadState.data.packages.filter(
        pack => pack.warnings.length > 0,
      ).length,
    })
  }, [loadState, requestKey, packages, metric, range, groupBy])

  useEffect(() => {
    if (packages.length === 0) {
      setLoadState({ status: 'empty', data: null })

      return
    }

    let isMounted = true
    const startedAt = performance.now()
    const downloadController = new AbortController()
    let serverRes: TrendsResponse | null = null
    let downloadsSettled = false

    let clientDownloads = new Map<string, PackageDownloadsResult>(
      packages.flatMap(pkg => {
        const cached = getCachedPackageDownloads(pkg, range)

        return cached ? ([[pkg, cached]] as const) : []
      }),
    )

    // Keep the current chart visible until a request genuinely needs a loading state.
    startLoading()

    const loadingTimer = window.setTimeout(() => {
      if (isMounted) {
        setLoadState(current => ({
          status: 'pending',
          data: current.data,
          showLoading: true,
        }))
      }
    }, 400)

    const publishIfReady = () => {
      if (!isMounted || !serverRes) return

      const merged = mergeDownloadsIntoTrendsResponse(
        serverRes,
        clientDownloads,
      )

      if (!downloadsSettled) {
        setLoadState(current => ({
          status: 'pending',
          data: merged,
          showLoading:
            current.status === 'pending' ? current.showLoading : false,
        }))

        return
      }

      window.clearTimeout(loadingTimer)
      setLoadState({ status: 'ready', data: merged, requestKey })
      trackTrendsLoad(merged, {
        packageCount: packages.length,
        range,
        startedAt,
      })
    }

    API.getTrends(packages, range)
      .then(res => {
        if (!isMounted) return

        serverRes = res

        if (res.packages.every(pack => pack.downloads.length > 0)) {
          downloadsSettled = true
          downloadController.abort()
        }

        publishIfReady()
      })
      .catch(err => {
        window.clearTimeout(loadingTimer)
        downloadController.abort()

        if (isMounted) {
          setLoadState(current => ({
            status: 'error',
            data: current.data,
            message: err?.message || 'Failed to fetch trends data',
          }))
          Analytics.trendsDataFailed({
            packageCount: packages.length,
            range,
            timeTaken: Math.round(performance.now() - startedAt),
          })
        }
      })

    fetchTrendsDownloads(packages, range, {
      signal: downloadController.signal,
    })
      .then(downloadsMap => {
        if (!isMounted || downloadsSettled) return

        clientDownloads = downloadsMap
        downloadsSettled = true
        publishIfReady()
      })
      .catch(err => {
        if (!isMounted || downloadsSettled) return

        if (err instanceof Error && err.name === 'AbortError') return

        downloadsSettled = true
        publishIfReady()
      })

    return () => {
      isMounted = false
      window.clearTimeout(loadingTimer)
      downloadController.abort()
    }
  }, [packages, range, requestKey, startLoading])

  return {
    trendsData: loadState.data,
    loading: loadState.status === 'pending' && loadState.showLoading,
    isPending: loadState.status === 'pending',
    error: loadState.status === 'error' ? loadState.message : null,
    startLoading,
  }
}
