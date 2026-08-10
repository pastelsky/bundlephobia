import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Button } from '@base-ui/react/button'
import { Checkbox } from '@base-ui/react/checkbox'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'

import API, {
  type TrendsGroupBy,
  type TrendsMetric,
  type TrendsRange,
  type TrendsResponse,
} from '../../client/api'
import Layout from '../../client/components/Layout'
import MetaTags from '../../client/components/MetaTags'
import PageNav from '../../client/components/PageNav'
import { AutocompleteInput } from '../../client/components/AutocompleteInput'
import { formatSize as formatBundleSize } from '../../utils'
import { getTrendsRecommendations } from '../../utils/trendsRecommendations'
import TrendsChart, { TRENDS_SERIES_COLORS } from './TrendsChart'

const DEFAULT_PACKAGES = ['react', 'vue']
const MAX_PACKAGES = 5

const METRICS: Array<{ id: TrendsMetric; label: string; description: string }> =
  [
    { id: 'downloads', label: 'Downloads', description: 'Daily npm downloads' },
    { id: 'stars', label: 'Stars', description: 'Total repository stargazers' },
    { id: 'size', label: 'Size', description: 'Cached gzip size history' },
    { id: 'issues', label: 'Issues', description: 'Open issue count' },
  ]

const RANGES: Array<{ id: TrendsRange; label: string }> = [
  { id: 'last-2-months', label: '2M' },
  { id: 'last-year', label: '1Y' },
  { id: 'last-3-years', label: '3Y' },
]

const GROUP_BY: Array<{ id: TrendsGroupBy; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

function formatCompactNumber(value: number | null) {
  if (value === null || value === undefined) return { value: '—', unit: '' }
  const trimZeros = (formatted: string) => formatted.replace(/\.?0+$/, '')
  if (value >= 1_000_000)
    return { value: trimZeros((value / 1_000_000).toFixed(2)), unit: 'M' }
  if (value >= 1_000)
    return { value: trimZeros((value / 1_000).toFixed(1)), unit: 'k' }
  return { value: value.toLocaleString(), unit: '' }
}

function formatSize(value: number | null) {
  if (value === null || value === undefined) return { value: '—', unit: '' }
  const formatted = formatBundleSize(value)
  return {
    value: parseFloat(
      formatted.size.toFixed(formatted.unit === 'B' ? 0 : 1)
    ).toString(),
    unit: formatted.unit,
  }
}

function MetricValue({
  formatted,
}: {
  formatted: { value: string; unit: string }
}) {
  return (
    <>
      <span className="trends-stat__number">{formatted.value}</span>
      {formatted.unit && (
        <span className="trends-stat__unit">{formatted.unit}</span>
      )}
    </>
  )
}

export default function TrendsPage() {
  const router = useRouter()
  const [packages, setPackages] = useState<string[]>(DEFAULT_PACKAGES)
  const [metric, setMetric] = useState<TrendsMetric>('downloads')
  const [range, setRange] = useState<TrendsRange>('last-year')
  const [groupBy, setGroupBy] = useState<TrendsGroupBy>('day')
  const [showMajorReleases, setShowMajorReleases] = useState(true)
  const [showMinorReleases, setShowMinorReleases] = useState(true)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trendsData, setTrendsData] = useState<TrendsResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [suggestionQueries, setSuggestionQueries] = useState<string[]>([])
  const [suggestedPackages, setSuggestedPackages] = useState<string[]>([])
  const trendsCache = useRef(new Map<string, TrendsResponse>())

  // Sync state with URL params on mount / router change
  useEffect(() => {
    if (!router.isReady) return
    const {
      packages: queryPackages,
      metric: queryMetric,
      range: queryRange,
      groupBy: queryGroupBy,
    } = router.query

    if (queryPackages) {
      const raw = Array.isArray(queryPackages)
        ? queryPackages.join(',')
        : queryPackages
      const parsed = raw
        .split(',')
        .map(p => p.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, MAX_PACKAGES)
      if (parsed.length > 0) {
        setPackages(current =>
          current.join(',') === parsed.join(',') ? current : parsed
        )
      }
    }

    if (
      typeof queryMetric === 'string' &&
      METRICS.some(m => m.id === queryMetric)
    ) {
      setMetric(queryMetric as TrendsMetric)
    }

    if (
      typeof queryRange === 'string' &&
      RANGES.some(r => r.id === queryRange)
    ) {
      setRange(queryRange as TrendsRange)
    }

    if (
      typeof queryGroupBy === 'string' &&
      GROUP_BY.some(option => option.id === queryGroupBy)
    ) {
      setGroupBy(queryGroupBy as TrendsGroupBy)
    }
  }, [router.isReady, router.query])

  // Curated similarity is useful only when the classifier is confident. Broad
  // frameworks otherwise receive purpose-level comparison peers instead.
  useEffect(() => {
    let isMounted = true
    Promise.all(
      packages.map(packageName => API.getSimilar(packageName).catch(() => null))
    ).then(results => {
      if (!isMounted) return
      const { recommendations, autocompleteQueries } = getTrendsRecommendations(
        {
          packages,
          similarResults: results,
        }
      )
      setSuggestionQueries(autocompleteQueries)
      setSuggestedPackages(recommendations)
    })

    return () => {
      isMounted = false
    }
  }, [packages])

  // Update URL parameters without full page reload
  const updateUrl = useCallback(
    (
      newPackages: string[],
      newMetric: TrendsMetric,
      newRange: TrendsRange,
      newGroupBy: TrendsGroupBy
    ) => {
      const query: Record<string, string> = {
        packages: newPackages.join(','),
        metric: newMetric,
        range: newRange,
        groupBy: newGroupBy,
      }
      router.push({ pathname: '/trends', query }, undefined, { shallow: true })
    },
    [router]
  )

  // Fetch trends data
  useEffect(() => {
    if (packages.length === 0) {
      setTrendsData(null)
      setLoading(false)
      return
    }

    const cacheKey = `${packages.join(',')}|${range}|${groupBy}`
    const cached = trendsCache.current.get(cacheKey)
    if (cached) {
      setTrendsData(cached)
      setError(null)
      setLoading(false)
      return
    }

    let isMounted = true
    let completed = false
    // An indicator that flashes for a quick cache or network response is more
    // distracting than helpful. Keep the current chart visible until a request
    // has genuinely taken long enough to need a loading state.
    setLoading(false)
    setError(null)
    const loadingTimer = window.setTimeout(() => {
      if (isMounted && !completed) setLoading(true)
    }, 400)

    API.getTrends(packages, range, groupBy)
      .then(res => {
        completed = true
        window.clearTimeout(loadingTimer)
        if (isMounted) {
          trendsCache.current.set(cacheKey, res)
          setTrendsData(res)
          setLoading(false)
        }
      })
      .catch(err => {
        completed = true
        window.clearTimeout(loadingTimer)
        if (isMounted) {
          setError(err?.message || 'Failed to fetch trends data')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
      window.clearTimeout(loadingTimer)
    }
  }, [packages, range, groupBy])

  const [inputKey, setInputKey] = useState(0)

  const handleAddPackage = (pkg: string) => {
    const clean = pkg.trim().toLowerCase()
    if (!clean || packages.some(selected => selected.toLowerCase() === clean))
      return
    if (packages.length >= MAX_PACKAGES) return
    const updated = [...packages, clean]
    setPackages(updated)
    setSuggestedPackages(current =>
      current.filter(packageName => packageName.toLowerCase() !== clean)
    )
    setInputKey(k => k + 1)
    updateUrl(updated, metric, range, groupBy)
  }

  const handleRemovePackage = (pkgName: string) => {
    const updated = packages.filter(p => p !== pkgName)
    setPackages(updated)
    updateUrl(updated, metric, range, groupBy)
  }

  const handleMetricChange = (newMetric: TrendsMetric) => {
    setMetric(newMetric)
    updateUrl(packages, newMetric, range, groupBy)
  }

  const handleRangeChange = (newRange: TrendsRange) => {
    setRange(newRange)
    updateUrl(packages, metric, newRange, groupBy)
  }

  const handleGroupByChange = (newGroupBy: TrendsGroupBy) => {
    setGroupBy(newGroupBy)
    updateUrl(packages, metric, range, newGroupBy)
  }

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const packageQuery = packages.join(',')
  const visibleSuggestedPackages = suggestedPackages.filter(
    packageName =>
      !packages.some(
        selected => selected.toLowerCase() === packageName.toLowerCase()
      )
  )
  const ogImageUrl = `/api/trends-image?packages=${encodeURIComponent(
    packageQuery
  )}&metric=${metric}&range=${range}&groupBy=${groupBy}`
  const pageTitle =
    packages.length > 0
      ? `${packages.join(' vs ')} trends | Bundlephobia`
      : 'Package trends | Bundlephobia'
  return (
    <Layout className="trends-page">
      <MetaTags
        title={pageTitle}
        description="Compare package download velocity, star growth, cached bundle sizes, and issue activity."
        canonicalPath="/trends"
        image={ogImageUrl}
      />
      <div className="trends-page__container">
        <PageNav minimal={true} />

        <header className="trends-page__header">
          <h1>Package trends</h1>
          <p className="trends-page__subtitle">
            Compare download velocity, star growth, size history, and issue
            activity across packages.
          </p>
        </header>

        {/* ─── Search & Package Selection ─── */}
        <section className="trends-search">
          <div className="trends-search__chips">
            {packages.map((pkg, index) => (
              <div
                key={pkg}
                className="trends-chip"
                role="group"
                aria-label={`${pkg} selected package`}
              >
                <span
                  className="trends-chip__color"
                  style={{
                    backgroundColor:
                      TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
                  }}
                />
                <span className="trends-chip__name">{pkg}</span>
                <Button
                  type="button"
                  className="trends-chip__remove"
                  onClick={() => handleRemovePackage(pkg)}
                  title={`Remove ${pkg}`}
                  aria-label={`Remove ${pkg}`}
                >
                  ×
                </Button>
              </div>
            ))}

            {packages.length < MAX_PACKAGES && (
              <div className="trends-search__input">
                <AutocompleteInput
                  key={inputKey}
                  containerClass="trends-autocomplete"
                  compact
                  suggestionQueries={suggestionQueries}
                  onSearchSubmit={handleAddPackage}
                />
              </div>
            )}
          </div>

          {visibleSuggestedPackages.length > 0 && (
            <div
              className="trends-search__suggestions"
              aria-label="Related packages"
            >
              <span className="trends-search__suggestions-label">
                Compare with
              </span>
              {visibleSuggestedPackages.map(packageName => (
                <Button
                  key={packageName}
                  type="button"
                  className="trends-preset"
                  onClick={() => handleAddPackage(packageName)}
                  aria-label={`Add ${packageName}`}
                >
                  + {packageName}
                </Button>
              ))}
            </div>
          )}
        </section>

        {/* ─── Toolbar: Metric, Range, Overlays, Actions ─── */}
        <div className="trends-toolbar">
          <div className="trends-toolbar__group">
            <span className="trends-toolbar__label">Metric</span>
            <ToggleGroup
              className="trends-segmented"
              value={[metric]}
              onValueChange={values => {
                const nextMetric = values[0]
                if (nextMetric) handleMetricChange(nextMetric as TrendsMetric)
              }}
            >
              {METRICS.map(m => (
                <Toggle
                  key={m.id}
                  type="button"
                  value={m.id}
                  className="trends-segmented__btn"
                  title={m.description}
                >
                  {m.label}
                </Toggle>
              ))}
            </ToggleGroup>
          </div>

          <div className="trends-toolbar__group">
            <span className="trends-toolbar__label">Range</span>
            <ToggleGroup
              className="trends-segmented trends-segmented--compact"
              value={[range]}
              onValueChange={values => {
                const nextRange = values[0]
                if (nextRange) handleRangeChange(nextRange as TrendsRange)
              }}
            >
              {RANGES.map(r => (
                <Toggle
                  key={r.id}
                  type="button"
                  value={r.id}
                  className="trends-segmented__btn"
                >
                  {r.label}
                </Toggle>
              ))}
            </ToggleGroup>
          </div>

          <div className="trends-toolbar__group">
            <span className="trends-toolbar__label">Group by</span>
            <ToggleGroup
              className="trends-segmented trends-segmented--compact"
              value={[groupBy]}
              onValueChange={values => {
                const nextGroupBy = values[0]
                if (nextGroupBy)
                  handleGroupByChange(nextGroupBy as TrendsGroupBy)
              }}
            >
              {GROUP_BY.map(option => (
                <Toggle
                  key={option.id}
                  type="button"
                  value={option.id}
                  className="trends-segmented__btn"
                >
                  {option.label}
                </Toggle>
              ))}
            </ToggleGroup>
          </div>

          <div className="trends-toolbar__group trends-toolbar__group--overlays">
            <span className="trends-toolbar__label">Overlays</span>
            <div className="trends-overlays">
              <label className="trends-toggle">
                <Checkbox.Root
                  checked={showMajorReleases}
                  onCheckedChange={setShowMajorReleases}
                  className="trends-toggle__control"
                >
                  <Checkbox.Indicator
                    keepMounted
                    className="trends-toggle__indicator"
                  />
                </Checkbox.Root>
                <span
                  className="trends-overlay-key trends-overlay-key--major"
                  aria-hidden="true"
                />
                <span className="trends-toggle__label">Major</span>
              </label>
              <label className="trends-toggle">
                <Checkbox.Root
                  checked={showMinorReleases}
                  onCheckedChange={setShowMinorReleases}
                  className="trends-toggle__control"
                >
                  <Checkbox.Indicator
                    keepMounted
                    className="trends-toggle__indicator"
                  />
                </Checkbox.Root>
                <span
                  className="trends-overlay-key trends-overlay-key--minor"
                  aria-hidden="true"
                />
                <span className="trends-toggle__label">Minor</span>
              </label>
            </div>
          </div>
        </div>

        {/* ─── Chart ─── */}
        <section className="trends-chart-area">
          {error ? (
            <div className="trends-chart-area__state trends-chart-area__state--error">
              {error}
            </div>
          ) : loading || trendsData ? (
            <TrendsChart
              packages={loading ? [] : trendsData?.packages || []}
              metric={metric}
              range={range}
              groupBy={groupBy}
              showMajorReleases={showMajorReleases}
              showMinorReleases={showMinorReleases}
              actions={
                <>
                  <Button
                    type="button"
                    className="trends-action"
                    onClick={handleCopyLink}
                  >
                    {copied ? 'Copied' : 'Share'}
                  </Button>
                  <a
                    href={ogImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={`bundlephobia-trends-${packages.join('-')}.jpg`}
                    className="trends-action"
                  >
                    Export
                  </a>
                </>
              }
              loading={loading}
            />
          ) : (
            <div className="trends-chart-area__state">
              Add at least one package above to compare trends.
            </div>
          )}
        </section>

        {/* ─── Package Snapshot Cards ─── */}
        {!loading && trendsData && trendsData.packages.length > 0 && (
          <section className="trends-snapshot">
            <h2 className="trends-snapshot__heading">Snapshot</h2>
            <div className="trends-snapshot__rows">
              <div className="trends-snapshot__columns" aria-hidden="true">
                <span>Package</span>
                <span>Stars</span>
                <span>Issues</span>
                <span>Gzip</span>
                <span>Minified</span>
              </div>
              {trendsData.packages.map((pack, index) => (
                <div key={pack.name} className="trends-card">
                  <div className="trends-card__header">
                    <span
                      className="trends-card__swatch"
                      style={{
                        backgroundColor:
                          TRENDS_SERIES_COLORS[
                            index % TRENDS_SERIES_COLORS.length
                          ],
                      }}
                    />
                    <Link
                      href={`/package/${pack.name}`}
                      className="trends-card__name"
                    >
                      {pack.name}
                    </Link>
                  </div>
                  <div className="trends-card__stats">
                    <div className="trends-stat">
                      <span className="trends-stat__label">Stars</span>
                      <span className="trends-stat__value">
                        <MetricValue
                          formatted={formatCompactNumber(pack.current.stars)}
                        />
                      </span>
                    </div>
                    <div className="trends-stat">
                      <span className="trends-stat__label">Issues</span>
                      <span className="trends-stat__value">
                        <MetricValue
                          formatted={formatCompactNumber(
                            pack.current.openIssues
                          )}
                        />
                      </span>
                    </div>
                    <div className="trends-stat">
                      <span className="trends-stat__label">Gzip</span>
                      <span className="trends-stat__value">
                        <MetricValue
                          formatted={formatSize(pack.current.gzip)}
                        />
                      </span>
                    </div>
                    <div className="trends-stat">
                      <span className="trends-stat__label">Minified</span>
                      <span className="trends-stat__value">
                        <MetricValue
                          formatted={formatSize(pack.current.size)}
                        />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}
