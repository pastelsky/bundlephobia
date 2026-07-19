import Router, { withRouter, type NextRouter } from 'next/router'
import type { GetServerSidePropsContext } from 'next'
import React, { PureComponent } from 'react'
import semver from 'semver'

import Analytics from '../../../client/analytics'
import API, {
  type PackageBuildInfo,
  type PackageHistoryResponse,
  type PackageBuildInfoSnapshot,
} from '../../../client/api'
import EmptyBox from '../../../client/assets/empty-box.svg'
import { AutocompleteInput } from '../../../client/components/AutocompleteInput'
import AutocompleteInputBox from '../../../client/components/AutocompleteInputBox'
import BarGraph from '../../../client/components/BarGraph'
import { type Reading } from '../../../client/components/BarGraph/BarGraph'
import BuildProgressIndicator from '../../../client/components/BuildProgressIndicator'
import MetaTags, {
  DEFAULT_DESCRIPTION_START,
} from '../../../client/components/MetaTags'
import QuickStatsBar from '../../../client/components/QuickStatsBar/QuickStatsBar'
import ResultLayout from '../../../client/components/ResultLayout'
import Stat from '../../../client/components/Stat'
import Warning from '../../../client/components/Warning/Warning'
import { formatSentence, parsePackageString } from '../../../utils/common.utils'
import {
  DownloadSpeed,
  formatSize,
  getTimeFromSize,
  resolveBuildError,
} from '../../../utils'
import ExportAnalysisSection from './components/ExportAnalysisSection'
import InterLinksSection from './components/InterLinksSection'
import SimilarPackagesSection from './components/SimilarPackagesSection'
import TreemapSection from './components/TreemapSection'
import config from '../../../server/config'
import { createPackageRequest } from '../../../server/services/packageResolution.service'
import { readCachedPackageSize } from '../../../server/middlewares/results/packageSize.middleware'

type PromiseState = 'pending' | 'fulfilled' | 'rejected' | null

type ResultPageProps = {
  router: NextRouter
  initialResult: PackageBuildInfo | null
  initialPackageString: string
}

type ResultPageState = {
  results: PackageBuildInfo | null
  resultsPromiseState: PromiseState
  resultsError: unknown
  historicalResultsPromiseState: PromiseState
  inputInitialValue: string
  historicalResults: PackageHistoryResponse
  similarPackages: PackageBuildInfo[]
  similarPackagesCategory: string | null
}

function isEmptySnapshot(reading: PackageBuildInfoSnapshot) {
  return Object.keys(reading).length === 0
}

function truncateMetaDescription(description: string) {
  if (description.length <= 160) return description
  return `${description.slice(0, 157).trimEnd()}…`
}

function getPackageStringFromRouter(router: NextRouter) {
  const { packageString } = router.query

  if (Array.isArray(packageString)) {
    return packageString.join('/')
  }

  return packageString ?? null
}

class ResultPage extends PureComponent<ResultPageProps, ResultPageState> {
  state: ResultPageState = {
    results: this.props.initialResult,
    resultsPromiseState: this.props.initialResult ? 'fulfilled' : null,
    resultsError: null,
    historicalResultsPromiseState: null,
    inputInitialValue: this.props.initialPackageString,
    historicalResults: {},
    similarPackages: [],
    similarPackagesCategory: null,
  }

  private activeQuery: string | null = null

  componentDidMount() {
    Analytics.pageView('package result')

    const packageString = getPackageStringFromRouter(this.props.router)
    if (packageString === null) return

    this.activeQuery = packageString

    if (this.props.initialResult) {
      this.scheduleSecondaryFetches(packageString)
    } else {
      this.setState(
        {
          resultsPromiseState: 'pending',
          historicalResultsPromiseState: 'pending',
        },
        () => this.fetchResults(packageString)
      )
    }
  }

  scheduleSecondaryFetches = (packageString: string) => {
    const fetchSecondaryData = () => {
      this.fetchHistory(packageString)
      this.fetchSimilarPackages(packageString)
    }

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fetchSecondaryData, { timeout: 2000 })
    } else {
      setTimeout(fetchSecondaryData, 1)
    }
  }

  componentDidUpdate(prevProps: ResultPageProps) {
    const packageString = getPackageStringFromRouter(prevProps.router)
    const nextPackageString = getPackageStringFromRouter(this.props.router)

    if (packageString === null || nextPackageString === null) {
      return
    }

    const currentPackage = parsePackageString(packageString)
    const nextPackage = parsePackageString(nextPackageString)

    const isPackageDifferent =
      currentPackage.name !== nextPackage.name ||
      currentPackage.version !== nextPackage.version

    const isSelfInitiatedNavigation = this.activeQuery === nextPackageString

    if (isPackageDifferent && !isSelfInitiatedNavigation) {
      this.handleSearchSubmit(nextPackageString)
    }
  }

  fetchResults = (packageString: string) => {
    const startTime = Date.now()

    API.getInfo(packageString)
      .then(results => {
        if (this.activeQuery !== packageString) return

        const newPackageString = `${results.name}@${results.version}`
        this.setState(
          {
            inputInitialValue: newPackageString,
            results,
            resultsPromiseState: 'fulfilled',
          },
          () => {
            this.scheduleSecondaryFetches(packageString)
          }
        )

        Analytics.searchSuccess({
          packageName: packageString,
          timeTaken: Date.now() - startTime,
        })
      })
      .catch(err => {
        this.setState({
          resultsError: err,
          resultsPromiseState: 'rejected',
          historicalResultsPromiseState: null,
        })
        console.error(err)

        Analytics.searchFailure({
          packageName: packageString,
          timeTaken: Date.now() - startTime,
        })
      })
  }

  fetchHistory = (packageString: string) => {
    API.getHistory(packageString, 15)
      .then(results => {
        if (this.activeQuery !== packageString) return

        this.setState({
          historicalResultsPromiseState: 'fulfilled',
          historicalResults: results,
        })
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error('Fetching history failed:', err)
      })
  }

  fetchSimilarPackages = (packageString: string) => {
    const { name } = parsePackageString(packageString)

    API.getSimilar(name)
      .then(result => {
        const { label, score, similar } = result.category
        if (label === null || score < 12) {
          return
        }

        const promises = similar.map(packageName => API.getInfo(packageName))

        Promise.allSettled(promises).then(results => {
          if (this.activeQuery !== packageString) return

          this.setState({
            similarPackagesCategory: label,
            similarPackages: results
              .filter(
                (
                  settledResult
                ): settledResult is PromiseFulfilledResult<PackageBuildInfo> =>
                  settledResult.status === 'fulfilled'
              )
              .map(settledResult => settledResult.value),
          })
        })
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error(err)
      })
  }

  handleSearchSubmit = (packageString: string) => {
    Analytics.performedSearch(packageString)
    const normalizedQuery = packageString.trim()

    this.setState(
      {
        results: null,
        resultsError: null,
        historicalResultsPromiseState: 'pending',
        resultsPromiseState: 'pending',
        inputInitialValue: normalizedQuery,
        similarPackages: [],
        historicalResults: {},
        similarPackagesCategory: null,
      },
      () => {
        this.activeQuery = normalizedQuery
        Router.push(`/package/${normalizedQuery}`)
        Analytics.pageView('package result')
        this.fetchResults(normalizedQuery)
      }
    )
  }

  handleProgressDone = () => {
    this.setState({
      resultsPromiseState: 'fulfilled',
    })
  }

  formatHistoricalResults = (): Reading[] => {
    const { results, historicalResults } = this.state

    if (!results) {
      return []
    }

    const totalVersions: PackageHistoryResponse = {
      ...historicalResults,
      [results.version]: results,
    }

    const formattedResults = Object.keys(totalVersions).map(version => {
      const reading = totalVersions[version]

      if (isEmptySnapshot(reading)) {
        return {
          version,
          disabled: true,
          size: 0,
          gzip: 0,
          hasSideEffects: false,
          hasJSModule: false,
          hasJSNext: false,
          isModuleType: false,
        }
      }

      return {
        version,
        disabled: false,
        size: reading.size ?? 0,
        gzip: reading.gzip ?? 0,
        hasSideEffects: Boolean(reading.hasSideEffects),
        hasJSModule: Boolean(reading.hasJSModule),
        hasJSNext: Boolean(reading.hasJSNext),
        isModuleType: Boolean(reading.isModuleType),
      }
    })

    const sorted = formattedResults.sort((packageA, packageB) =>
      semver.compare(packageA.version, packageB.version)
    )

    return typeof window !== 'undefined' && window.innerWidth < 640
      ? sorted.slice(-10)
      : sorted
  }

  handleBarClick = (reading: Reading) => {
    const { results } = this.state

    if (!results) {
      return
    }

    const packageString = `${results.name}@${reading.version}`
    this.setState({ inputInitialValue: packageString })
    this.handleSearchSubmit(packageString)

    Analytics.graphBarClicked({
      packageName: packageString,
      isDisabled: !!reading.disabled,
    })
  }

  getMetaTags = () => {
    const { router } = this.props
    const { resultsPromiseState, results } = this.state
    const hasBuildResult = resultsPromiseState === 'fulfilled' && results
    const requestedPackage = parsePackageString(
      getPackageStringFromRouter(router) ?? this.props.initialPackageString
    )
    const name = hasBuildResult ? results.name : requestedPackage.name
    const version = hasBuildResult ? results.version : requestedPackage.version
    let formattedSizes: { minified: string; gzip: string } | null = null

    if (hasBuildResult) {
      const formattedSize = formatSize(results.size)
      const formattedGZIPSize = formatSize(results.gzip)
      formattedSizes = {
        minified: `${formattedSize.size.toFixed(1)} ${formattedSize.unit}`,
        gzip: `${formattedGZIPSize.size.toFixed(1)} ${formattedGZIPSize.unit}`,
      }
    }

    const origin =
      typeof window === 'undefined'
        ? 'https://bundlephobia.com'
        : window.location.origin

    const versionLabel = version ? `${name} v${version}` : name
    const pageTitle = formattedSizes
      ? `${name} bundle size: ${formattedSizes.gzip} gzip | Bundlephobia`
      : `${name} bundle size, gzip size & dependencies | Bundlephobia`
    const packageDescription = this.props.initialResult?.description
    const summary = formattedSizes
      ? `${versionLabel} is ${formattedSizes.minified} minified and ${formattedSizes.gzip} with gzip. Check dependencies, exports and package composition.`
      : `Check the minified and gzip bundle size of ${versionLabel}, its dependencies, exports and package composition. ${DEFAULT_DESCRIPTION_START}`
    const description = truncateMetaDescription(
      packageDescription ? `${summary} ${packageDescription}` : summary
    )

    return (
      <MetaTags
        title={pageTitle}
        image={
          origin + `/api/stats-image?name=${name}&version=${version}&wide=true`
        }
        description={description}
        twitterDescription={description}
        canonicalPath={`/package/${name}`}
        isLargeImage
      />
    )
  }

  render() {
    const {
      inputInitialValue,
      resultsPromiseState,
      resultsError,
      historicalResultsPromiseState,
      results,
      similarPackages,
      similarPackagesCategory,
    } = this.state

    const { errorName, errorBody, errorDetails } =
      resolveBuildError(resultsError)

    const referenceSpeedInfoText = (speed: number, units: string) =>
      `Download Speed: ⬇️ ${speed} ${units}.\nExclusive of HTTP request latency.`

    const buildResult = resultsPromiseState === 'fulfilled' ? results : null

    const getQuickStatsBar = () =>
      buildResult && (
        <QuickStatsBar
          description={buildResult.description}
          dependencyCount={buildResult.dependencyCount}
          hasSideEffects={buildResult.hasSideEffects}
          isTreeShakeable={
            buildResult.hasJSModule ||
            buildResult.hasJSNext ||
            buildResult.isModuleType
          }
          repository={buildResult.repository}
          name={buildResult.name}
        />
      )

    return (
      <ResultLayout>
        {this.getMetaTags()}
        <section className="content-container-wrap">
          <div className="content-container">
            <AutocompleteInputBox footer={getQuickStatsBar()}>
              <AutocompleteInput
                key={inputInitialValue}
                initialValue={inputInitialValue}
                className="result-page__search-input"
                onSearchSubmit={this.handleSearchSubmit}
                renderAsH1
              />
            </AutocompleteInputBox>
            {resultsPromiseState === 'pending' && (
              <div className="result-pending">
                <BuildProgressIndicator
                  isDone={!!results?.version}
                  onDone={this.handleProgressDone}
                />
              </div>
            )}
            {buildResult &&
              buildResult.ignoredMissingDependencies &&
              buildResult.ignoredMissingDependencies.length > 0 && (
                <Warning>
                  Ignoring the size of missing{' '}
                  {buildResult.ignoredMissingDependencies.length > 1
                    ? 'dependencies'
                    : 'dependency'}{' '}
                  &nbsp;
                  <code>
                    {formatSentence(buildResult.ignoredMissingDependencies)}
                  </code>
                  .
                  <a
                    href="https://github.com/pastelsky/bundlephobia#1-why-does-search-for-package-x-throw-missingdependencyerror-"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read more
                  </a>
                </Warning>
              )}
            {buildResult && (
              <div className="content-split-container">
                <div className="stats-container">
                  <div className="size-container">
                    <h3> Bundle Size </h3>
                    <div className="size-stats">
                      <Stat
                        value={buildResult.size}
                        type={Stat.type.SIZE}
                        label="Minified"
                      />
                      <Stat
                        value={buildResult.gzip}
                        type={Stat.type.SIZE}
                        label="Minified + Gzipped"
                      />
                    </div>
                  </div>
                  <div className="time-container">
                    <h3> Download Time </h3>
                    <div className="time-stats">
                      <Stat
                        value={getTimeFromSize(buildResult.gzip).threeG}
                        type={Stat.type.TIME}
                        label="Slow 3G"
                        infoText={referenceSpeedInfoText(
                          DownloadSpeed.THREE_G,
                          'kB/s'
                        )}
                      />
                      <Stat
                        value={getTimeFromSize(buildResult.gzip).fourG}
                        type={Stat.type.TIME}
                        label="Emerging 4G"
                        infoText={referenceSpeedInfoText(
                          DownloadSpeed.FOUR_G,
                          'kB/s'
                        )}
                      />
                    </div>
                  </div>
                </div>
                <div className="chart-container">
                  {historicalResultsPromiseState === 'fulfilled' && (
                    <BarGraph
                      onBarClick={this.handleBarClick}
                      readings={this.formatHistoricalResults()}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {resultsPromiseState === 'rejected' && (
            <div className="result-error">
              <EmptyBox className="result-error__img" />
              <h2 className="result-error__code">{errorName}</h2>
              {errorBody !== null && (
                <p
                  className="result-error__message"
                  dangerouslySetInnerHTML={{ __html: errorBody }}
                />
              )}
              {errorDetails && (
                <details className="result-error__details">
                  <summary> Stacktrace</summary>
                  <pre>{errorDetails}</pre>
                </details>
              )}
            </div>
          )}
          {buildResult &&
            buildResult.dependencySizes &&
            buildResult.dependencySizes.length > 0 && (
              <div className="content-container">
                <TreemapSection
                  packageName={buildResult.name}
                  packageSize={buildResult.size}
                  dependencySizes={buildResult.dependencySizes}
                />
              </div>
            )}

          {buildResult && (
            <div className="content-container">
              <ExportAnalysisSection result={buildResult} />
            </div>
          )}

          {buildResult &&
            similarPackagesCategory !== null &&
            similarPackages.length > 0 && (
              <div className="content-container">
                <SimilarPackagesSection
                  category={similarPackagesCategory}
                  packs={similarPackages}
                  comparisonGzip={buildResult.gzip}
                />
              </div>
            )}

          {buildResult && parsePackageString(buildResult.name).scoped && (
            <InterLinksSection packageName={buildResult.name} />
          )}
        </section>
      </ResultLayout>
    )
  }
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const packageParam = context.params?.packageString
  const packageString = Array.isArray(packageParam)
    ? packageParam.join('/')
    : packageParam

  // This caches the rendered document. API cache-control middleware does not
  // run for Next.js page responses handled by the catch-all Koa route.
  context.res.setHeader(
    'Cache-Control',
    `public, s-maxage=${config.CACHE.PACKAGE_PAGE_SHARED}, ` +
      `stale-while-revalidate=${config.CACHE.PACKAGE_PAGE_STALE}`
  )

  if (packageString === undefined || packageString.length === 0) {
    return { notFound: true }
  }

  try {
    // Cache-only: never resolve via npm during SSR. A cache miss (or a
    // tag/range that needs resolution) renders with initialResult null, and
    // the client then performs the full resolve-and-build lookup on mount.
    const initialResult = await readCachedPackageSize(
      createPackageRequest(packageString)
    )
    return {
      props: {
        initialResult,
        initialPackageString: packageString,
      },
    }
  } catch {
    // Keep the document stable when the cache service is unavailable. The
    // client can still perform the normal interactive lookup.
    return {
      props: {
        initialResult: null,
        initialPackageString: packageString,
      },
    }
  }
}

export default withRouter(ResultPage)
