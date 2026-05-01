import React, { PureComponent } from 'react'
import Analytics from '../../../client/analytics'

import ResultLayout from '../../../client/components/ResultLayout'
import BarGraph from '../../../client/components/BarGraph'
import { AutocompleteInput } from '../../../client/components/AutocompleteInput'
import AutocompleteInputBox from '../../../client/components/AutocompleteInputBox'
import BuildProgressIndicator from '../../../client/components/BuildProgressIndicator'
import Router, { withRouter } from 'next/router'
import semver from 'semver'
import isEmptyObject from 'is-empty-object'
import { parsePackageString } from '../../../utils/common.utils'
import {
  getTimeFromSize,
  DownloadSpeed,
  resolveBuildError,
  formatSize,
} from '../../../utils'
import Stat from '../../../client/components/Stat'

import API from '../../../client/api'
import MetaTags, {
  DEFAULT_DESCRIPTION_START,
} from '../../../client/components/MetaTags'
import InterLinksSection from './components/InterLinksSection'

import TreemapSection from './components/TreemapSection'
import EmptyBox from '../../../client/assets/empty-box.svg'
import SimilarPackagesSection from './components/SimilarPackagesSection'
import ExportAnalysisSection from './components/ExportAnalysisSection'
import QuickStatsBar from '../../../client/components/QuickStatsBar/QuickStatsBar'

import Warning from '../../../client/components/Warning/Warning'
import arrayToSentence from 'array-to-sentence'

class ResultPage extends PureComponent {
  expectedRouteQueries = new Set()

  state = {
    results: {},
    resultsPromiseState: null,
    resultsError: null,
    historicalResultsPromiseState: null,
    inputInitialValue: this.getPackageString(this.props.router) || '',
    historicalResults: [],
    similarPackages: [],
    similarPackagesCategory: '',
  }

  getPackageString(router) {
    return router.query.packageString?.join('/') || ''
  }

  normalizePackageString(packageString = '') {
    return packageString.trim()
  }

  getRoutePackageString(router = this.props.router) {
    return this.normalizePackageString(this.getPackageString(router))
  }

  logSearchFlow(event, details = {}) {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    console.info(`[ResultPage] ${event}`, {
      ...details,
      activeQuery: this.activeQuery || null,
      expectedRouteQueries: Array.from(this.expectedRouteQueries),
      routePackageString: this.getRoutePackageString(),
    })
  }

  markExpectedRouteQuery(packageString) {
    const normalizedQuery = this.normalizePackageString(packageString)

    if (!normalizedQuery) {
      return
    }

    this.expectedRouteQueries.add(normalizedQuery)
    this.logSearchFlow('markExpectedRouteQuery', { normalizedQuery })
  }

  consumeExpectedRouteQuery(packageString) {
    const normalizedQuery = this.normalizePackageString(packageString)
    const wasExpected = this.expectedRouteQueries.delete(normalizedQuery)

    if (wasExpected) {
      this.logSearchFlow('consumeExpectedRouteQuery', { normalizedQuery })
    }

    return wasExpected
  }

  componentDidMount() {
    Analytics.pageView('package result')

    const packageString = this.getRoutePackageString(this.props.router)
    this.logSearchFlow('componentDidMount', { packageString })

    if (packageString) {
      this.handleSearchSubmit(packageString, { source: 'mount' })
    }
  }

  componentDidUpdate(prevProps) {
    const packageString = this.getRoutePackageString(prevProps.router)
    const nextPackageString = this.getRoutePackageString(this.props.router)

    if (!nextPackageString) {
      return
    }

    const currentPackage = parsePackageString(packageString)
    const nextPackage = parsePackageString(nextPackageString)

    const isPackageDifferent =
      currentPackage.name !== nextPackage.name ||
      currentPackage.version !== nextPackage.version

    this.logSearchFlow('componentDidUpdate', {
      packageString,
      nextPackageString,
      isPackageDifferent,
    })

    if (!isPackageDifferent) {
      return
    }

    if (this.consumeExpectedRouteQuery(nextPackageString)) {
      return
    }

    this.handleSearchSubmit(nextPackageString, { source: 'route-change' })
  }

  fetchResults = packageString => {
    const startTime = Date.now()
    this.logSearchFlow('fetchResults:start', { packageString })

    API.getInfo(packageString)
      .then(results => {
        this.fetchSimilarPackages(packageString)

        if (this.activeQuery !== packageString) {
          this.logSearchFlow('fetchResults:stale', {
            packageString,
            resultsPackageString: `${results.name}@${results.version}`,
          })
          return
        }

        const newPackageString = `${results.name}@${results.version}`
        const shouldReplaceRoute =
          this.getRoutePackageString() !== newPackageString

        if (shouldReplaceRoute) {
          this.markExpectedRouteQuery(newPackageString)
        }

        this.setState(
          {
            inputInitialValue: newPackageString,
            results,
          },
          () => {
            this.logSearchFlow('fetchResults:routeSync', {
              packageString,
              newPackageString,
              shouldReplaceRoute,
            })

            if (shouldReplaceRoute) {
              Router.replace(`/package/${newPackageString}`)
            }
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
        })
        this.logSearchFlow('fetchResults:error', { packageString, err })
        console.error(err)

        Analytics.searchFailure({
          packageName: packageString,
          timeTaken: Date.now() - startTime,
        })
      })
  }

  fetchHistory = packageString => {
    this.logSearchFlow('fetchHistory:start', { packageString })
    API.getHistory(packageString, 15)
      .then(results => {
        if (this.activeQuery !== packageString) {
          this.logSearchFlow('fetchHistory:stale', { packageString })
          return
        }

        this.setState({
          historicalResultsPromiseState: 'fulfilled',
          historicalResults: results,
        })
        this.logSearchFlow('fetchHistory:success', {
          packageString,
          resultCount: results.length,
        })
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        this.logSearchFlow('fetchHistory:error', { packageString, err })
        console.error('Fetching history failed:', err)
      })
  }

  fetchSimilarPackages = packageString => {
    const { name } = parsePackageString(packageString)
    const promises = []
    this.logSearchFlow('fetchSimilarPackages:start', { packageString, name })

    API.getSimilar(name)
      .then(result => {
        if (result.category.label) {
          if (result.category.score < 12) return

          result.category.similar.forEach(packageName => {
            promises.push(API.getInfo(packageName))
          })

          Promise.allSettled(promises).then(results => {
            if (this.activeQuery !== packageString) {
              this.logSearchFlow('fetchSimilarPackages:stale', {
                packageString,
                resultCount: results.length,
              })
              return
            }

            this.setState({
              similarPackagesCategory: result.category.label,
              similarPackages: results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value),
            })
            this.logSearchFlow('fetchSimilarPackages:success', {
              packageString,
              category: result.category.label,
              resultCount: results.length,
            })
          })
        }
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        this.logSearchFlow('fetchSimilarPackages:error', { packageString, err })
        console.error(err)
      })
  }

  handleSearchSubmit = (packageString, { source = 'unknown' } = {}) => {
    Analytics.performedSearch(packageString)
    const normalizedQuery = this.normalizePackageString(packageString)
    const routePackageString = this.getRoutePackageString()
    const shouldPushRoute = routePackageString !== normalizedQuery

    this.logSearchFlow('handleSearchSubmit', {
      source,
      packageString,
      normalizedQuery,
      routePackageString,
      shouldPushRoute,
    })

    this.setState(
      {
        results: {},
        historicalResultsPromiseState: 'pending',
        resultsPromiseState: 'pending',
        inputInitialValue: normalizedQuery,
        similarPackages: [],
        historicalResults: [],
      },
      () => {
        this.activeQuery = normalizedQuery

        if (shouldPushRoute) {
          this.markExpectedRouteQuery(normalizedQuery)
          Router.push(`/package/${normalizedQuery}`)
        }

        Analytics.pageView('package result')
        this.fetchResults(normalizedQuery)
        this.fetchHistory(normalizedQuery)
      }
    )
  }

  handleProgressDone = () => {
    this.setState({
      resultsPromiseState: 'fulfilled',
    })
  }

  formatHistoricalResults = () => {
    const { results, historicalResults } = this.state
    const totalVersions = {
      ...historicalResults,
      [results.version]: results,
    }

    const formattedResults = Object.keys(totalVersions).map(version => {
      if (isEmptyObject(totalVersions[version])) {
        return { version, disabled: true }
      }
      return {
        version,
        size: totalVersions[version].size,
        gzip: totalVersions[version].gzip,
        hasSideEffects: totalVersions[version].hasSideEffects,
        hasJSModule: totalVersions[version].hasJSModule,
        hasJSNext: totalVersions[version].hasJSNext,
        isModuleType: totalVersions[version].isModuleType,
      }
    })
    const sorted = formattedResults.sort((packageA, packageB) =>
      semver.compare(packageA.version, packageB.version)
    )
    return typeof window !== 'undefined' && window.innerWidth < 640
      ? sorted.slice(-10)
      : sorted
  }

  handleBarClick = reading => {
    const { results } = this.state

    const packageString = `${results.name}@${reading.version}`
    this.setState({ inputInitialValue: packageString })
    this.handleSearchSubmit(packageString, { source: 'history-bar' })

    Analytics.graphBarClicked({
      packageName: packageString,
      idDisabled: reading.disabled,
    })
  }

  getMetaTags = () => {
    const { router } = this.props
    const { resultsPromiseState, results } = this.state
    let name, version, formattedSizeText, formattedGZIPSizeText

    if (resultsPromiseState === 'fulfilled') {
      name = results.name
      version = results.version
      const formattedSize = formatSize(results.size)
      const formattedGZIPSize = formatSize(results.gzip)
      formattedSizeText = `${formattedSize.size.toFixed(1)} ${
        formattedSize.unit
      }`
      formattedGZIPSizeText = `${formattedGZIPSize.size.toFixed(1)} ${
        formattedGZIPSize.unit
      }`
    } else {
      name = parsePackageString(this.getPackageString(router)).name
      version = parsePackageString(this.getPackageString(router)).version
      formattedSizeText = ''
      formattedGZIPSizeText = ''
    }

    const origin =
      typeof window === 'undefined'
        ? 'https://bundlephobia.com'
        : window.location.origin

    const title = version ? `${name} v${version}` : name
    const description =
      resultsPromiseState === 'fulfilled'
        ? `Size of ${title} is ${formattedSizeText} (minified), and ${formattedGZIPSizeText} when compressed using GZIP. ${DEFAULT_DESCRIPTION_START}`
        : `Find the size of javascript package ${title}. ${DEFAULT_DESCRIPTION_START}`

    return (
      <MetaTags
        title={`${title} ❘ Bundlephobia`}
        image={
          origin + `/api/stats-image?name=${name}&version=${version}&wide=true`
        }
        description={description}
        twitterDescription="Insights into npm packages"
        canonicalPath={`/package/${name}`}
        isLargeImage={true}
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

    const referenceSpeedInfoText = (speed, units) =>
      `Download Speed: ⬇️ ${speed} ${units}.\nExclusive of HTTP request latency.`

    const getQuickStatsBar = () =>
      resultsPromiseState === 'fulfilled' && (
        <QuickStatsBar
          description={results.description}
          dependencyCount={results.dependencyCount}
          hasSideEffects={results.hasSideEffects}
          isTreeShakeable={
            results.hasJSModule || results.hasJSNext || results.isModuleType
          }
          repository={results.repository}
          name={results.name}
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
                renderAsH1={true}
              />
            </AutocompleteInputBox>
            {resultsPromiseState === 'pending' && (
              <div className="result-pending">
                <BuildProgressIndicator
                  isDone={!!results.version}
                  onDone={this.handleProgressDone}
                />
              </div>
            )}
            {resultsPromiseState === 'fulfilled' &&
              results.ignoredMissingDependencies &&
              results.ignoredMissingDependencies.length && (
                <Warning>
                  Ignoring the size of missing{' '}
                  {results.ignoredMissingDependencies.length > 1
                    ? 'dependencies'
                    : 'dependency'}{' '}
                  &nbsp;
                  <code>
                    {arrayToSentence(results.ignoredMissingDependencies)}
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
            {resultsPromiseState === 'fulfilled' && (
              <div className="content-split-container">
                <div className="stats-container">
                  <div className="size-container">
                    <h3> Bundle Size </h3>
                    <div className="size-stats">
                      <Stat
                        value={results.size}
                        type={Stat.type.SIZE}
                        label="Minified"
                      />
                      <Stat
                        value={results.gzip}
                        type={Stat.type.SIZE}
                        label="Minified + Gzipped"
                      />
                    </div>
                  </div>
                  <div className="time-container">
                    <h3> Download Time </h3>
                    <div className="time-stats">
                      <Stat
                        value={getTimeFromSize(results.gzip).threeG}
                        type={Stat.type.TIME}
                        label="Slow 3G"
                        infoText={referenceSpeedInfoText(
                          DownloadSpeed.THREE_G,
                          'kB/s'
                        )}
                      />
                      <Stat
                        value={getTimeFromSize(results.gzip).fourG}
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
              <p
                className="result-error__message"
                dangerouslySetInnerHTML={{ __html: errorBody }}
              />
              {errorDetails && (
                <details className="result-error__details">
                  <summary> Stacktrace</summary>
                  <pre>{errorDetails}</pre>
                </details>
              )}
            </div>
          )}
          {resultsPromiseState === 'fulfilled' &&
            results.dependencySizes &&
            results.dependencySizes.length && (
              <div className="content-container">
                <TreemapSection
                  packageName={results.name}
                  packageSize={results.size}
                  dependencySizes={results.dependencySizes}
                />
              </div>
            )}

          {resultsPromiseState === 'fulfilled' && (
            <div className="content-container">
              <ExportAnalysisSection result={results} />
            </div>
          )}

          {resultsPromiseState === 'fulfilled' &&
            similarPackages.length > 0 && (
              <div className="content-container">
                <SimilarPackagesSection
                  category={similarPackagesCategory}
                  packs={similarPackages}
                  comparisonGzip={results.gzip}
                />
              </div>
            )}

          {resultsPromiseState === 'fulfilled' &&
            parsePackageString(results.name).scoped && (
              <InterLinksSection packageName={results.name} />
            )}
        </section>
      </ResultLayout>
    )
  }
}

export const getServerSideProps = () => {
  return { props: {} }
}

export default withRouter(ResultPage)
