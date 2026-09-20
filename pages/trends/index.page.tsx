import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsRange,
  TrendsResponse,
} from '@bundlephobia/service-contracts/trends'
import API from '../../client/api'
import { AutocompleteInput } from '../../client/components/AutocompleteInput'
import Layout from '../../client/components/Layout'
import MetaTags from '../../client/components/MetaTags'
import PageNav from '../../client/components/PageNav'
import TrendsChart, { TRENDS_SERIES_COLORS } from './TrendsChart'

const DEFAULT_PACKAGES = ['react', 'vue']

const MAX_PACKAGES = 5

const metrics: Array<{ value: TrendsMetric; label: string }> = [
  { value: 'downloads', label: 'Downloads' },
  { value: 'stars', label: 'Star actions' },
  { value: 'size', label: 'Gzip size' },
]

const ranges: Array<{ value: TrendsRange; label: string }> = [
  { value: 'last-2-months', label: '2 months' },
  { value: 'last-year', label: '1 year' },
  { value: 'last-3-years', label: '3 years' },
]

const groupings: Array<{ value: TrendsGroupBy; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

type TrendsUrlState = {
  packages?: string[]
  metric?: TrendsMetric
  range?: TrendsRange
  groupBy?: TrendsGroupBy
}

function queryList(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : [value ?? ''])
    .flatMap(part => part.split(','))
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_PACKAGES)
}

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function readUrlState(
  query: Record<string, string | string[] | undefined>,
): TrendsUrlState {
  const next: TrendsUrlState = {}
  const queryPackages = queryList(query.packages)
  const metric = metrics.find(item => item.value === queryValue(query.metric))
  const range = ranges.find(item => item.value === queryValue(query.range))

  const groupBy = groupings.find(
    item => item.value === queryValue(query.groupBy),
  )

  if (queryPackages.length) next.packages = queryPackages

  if (metric) next.metric = metric.value

  if (range) next.range = range.value

  if (groupBy) next.groupBy = groupBy.value

  return next
}

function selectValue<T extends string>(
  value: string,
  options: Array<{ value: T }>,
): T {
  return (
    options.find(option => option.value === value)?.value ?? options[0].value
  )
}

function metricDescription(metric: TrendsMetric): string {
  if (metric === 'downloads') return 'weekly downloads'

  if (metric === 'stars') return 'GitHub stars'

  return 'gzip size'
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString()
}

function formatSize(value: number | null): string {
  if (value === null) return '—'

  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`

  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} kB`

  return `${value} B`
}

function packageCurrentValue(
  series: TrendsPackageSeries,
  metric: TrendsMetric,
): string {
  if (metric === 'downloads')
    return `${formatNumber(series.current.weeklyDownloads)} / week`

  if (metric === 'stars') return formatNumber(series.current.stars)

  return formatSize(series.current.gzip)
}

export default function TrendsPage() {
  const router = useRouter()
  const [packages, setPackages] = useState(DEFAULT_PACKAGES)
  const [metric, setMetric] = useState<TrendsMetric>('downloads')
  const [range, setRange] = useState<TrendsRange>('last-year')
  const [groupBy, setGroupBy] = useState<TrendsGroupBy>('week')
  const [data, setData] = useState<TrendsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!router.isReady) return

    const next = readUrlState(router.query)

    if (next.packages) setPackages(next.packages)

    if (next.metric) setMetric(next.metric)

    if (next.range) setRange(next.range)

    if (next.groupBy) setGroupBy(next.groupBy)
  }, [router.isReady, router.query])

  useEffect(() => {
    if (!packages.length) return
    let active = true
    setLoading(true)
    setError(null)

    API.getTrends(packages, range, groupBy)
      .then(result => {
        if (active) setData(result)
      })
      .catch(reason => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Unable to load trends',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [groupBy, packages, range])

  const updateUrl = (state: {
    packages: string[]
    metric: TrendsMetric
    range: TrendsRange
    groupBy: TrendsGroupBy
  }) => {
    void router.push(
      {
        pathname: '/trends',
        query: {
          packages: state.packages.join(','),
          metric: state.metric,
          range: state.range,
          groupBy: state.groupBy,
        },
      },
      undefined,
      { shallow: true },
    )
  }

  const changeMetric = (value: TrendsMetric) => {
    setMetric(value)
    updateUrl({ packages, metric: value, range, groupBy })
  }

  const addPackage = (value: string) => {
    const packageName = value.trim().toLowerCase()

    if (
      !packageName ||
      packages.includes(packageName) ||
      packages.length >= MAX_PACKAGES
    )
      return
    const nextPackages = [...packages, packageName]
    setPackages(nextPackages)
    updateUrl({ packages: nextPackages, metric, range, groupBy })
  }

  const removePackage = (packageName: string) => {
    if (packages.length === 1) return
    const nextPackages = packages.filter(item => item !== packageName)
    setPackages(nextPackages)
    updateUrl({ packages: nextPackages, metric, range, groupBy })
  }

  const changeRange = (value: TrendsRange) => {
    setRange(value)
    updateUrl({ packages, metric, range: value, groupBy })
  }

  const changeGrouping = (value: TrendsGroupBy) => {
    setGroupBy(value)
    updateUrl({ packages, metric, range, groupBy: value })
  }

  const series = useMemo(() => data?.packages ?? [], [data])

  return (
    <Layout className="trends-page">
      <MetaTags
        title="Package trends | Bundlephobia"
        description="Compare npm downloads, GitHub star actions, and gzip size history across packages."
        canonicalPath="/trends"
      />
      <PageNav />
      <main className="trends-page__container">
        <header className="trends-page__header">
          <p className="trends-page__eyebrow">Explore the ecosystem</p>
          <h1>Package trends</h1>
          <p className="trends-page__subtitle">
            Compare adoption, community momentum, and bundle size over time.
          </p>
        </header>

        <section className="trends-selector" aria-label="Packages to compare">
          <div className="trends-selector__packages">
            {packages.map((packageName, index) => (
              <span className="trends-chip" key={packageName}>
                <i
                  style={{
                    backgroundColor:
                      TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
                  }}
                />
                {packageName}
                <button
                  type="button"
                  onClick={() => removePackage(packageName)}
                  aria-label={`Remove ${packageName}`}
                >
                  ×
                </button>
              </span>
            ))}
            {packages.length < MAX_PACKAGES && (
              <AutocompleteInput
                compact
                containerClass="trends-selector__input"
                loadSuggestions={API.getSuggestions}
                onSearchSubmit={addPackage}
              />
            )}
          </div>
          <p className="trends-selector__hint">
            Add up to five npm packages to compare them.
          </p>
        </section>

        <section className="trends-controls" aria-label="Chart controls">
          <label>
            <span>Metric</span>
            <select
              value={metric}
              onChange={event =>
                changeMetric(selectValue(event.target.value, metrics))
              }
            >
              {metrics.map(item => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Range</span>
            <select
              value={range}
              onChange={event =>
                changeRange(selectValue(event.target.value, ranges))
              }
            >
              {ranges.map(item => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Group by</span>
            <select
              value={groupBy}
              onChange={event =>
                changeGrouping(selectValue(event.target.value, groupings))
              }
            >
              {groupings.map(item => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="trends-summary" aria-label="Current package values">
          {series.map((item, index) => (
            <article key={item.name}>
              <span className="trends-summary__name">
                <i
                  style={{
                    backgroundColor:
                      TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
                  }}
                />
                {item.name}
              </span>
              <strong>{packageCurrentValue(item, metric)}</strong>
              <small>current {metricDescription(metric)}</small>
            </article>
          ))}
        </section>

        <section className="trends-chart-card">
          {error ? (
            <p className="trends-state trends-state--error">{error}</p>
          ) : loading && !data ? (
            <p className="trends-state">Loading trend data…</p>
          ) : (
            <TrendsChart packages={series} metric={metric} />
          )}
        </section>

        {series.some(item => item.warnings.length) && (
          <p className="trends-warning">
            Some sources were unavailable. Partial series are shown where
            possible.
          </p>
        )}
        <p className="trends-footnote">
          Downloads come from npm. Star history is GitHub’s daily star-action
          history; current stars are a live repository snapshot.
        </p>
      </main>
    </Layout>
  )
}
