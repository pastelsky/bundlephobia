import Router, { withRouter, type NextRouter } from 'next/router'
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
import { parsePackageString } from '../../../utils/common.utils'
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

type PromiseState = 'pending' | 'fulfilled' | 'rejected' | null

type ResultPageProps = {
  router: NextRouter
}

type ResultPageState = {
  results: PackageBuildInfo | null
  resultsPromiseState: PromiseState
  resultsError: unknown
  historicalResultsPromiseState: PromiseState
  inputInitialValue: string
  historicalResults: PackageHistoryResponse
  similarPackages: PackageBuildInfo[]
  similarPackagesCategory: string
}

type ResolvedBuildError = {
  errorName: string | null
  errorBody: string | null
  errorDetails: string | null
}

function isEmptySnapshot(reading: PackageBuildInfoSnapshot) {
  return Object.keys(reading).length === 0
}

function formatSentence(values: string[]) {
  if (values.length === 0) {
    return ''
  }

  if (values.length === 1) {
    return values[0]
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }

  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function getResolvedBuildError(resultsError: unknown): ResolvedBuildError {
  return resolveBuildError(resultsError)
}

function getPackageStringFromRouter(router: NextRouter) {
  const { packageString } = router.query

  if (Array.isArray(packageString)) {
    return packageString.join('/')
  }

  return packageString ?? ''
}

class ResultPage extends PureComponent<ResultPageProps, ResultPageState> {
  state: ResultPageState = {
    results: null,
    resultsPromiseState: null,
    resultsError: null,
    historicalResultsPromiseState: null,
    inputInitialValue: getPackageStringFromRouter(this.props.router),
    historicalResults: {},
    similarPackages: [],
    similarPackagesCategory: '',
  }

  private activeQuery: string | null = null

  componentDidMount() {
    Analytics.pageView('package result')

    const packageString = getPackageStringFromRouter(this.props.router)
    if (packageString) {
      this.handleSearchSubmit(packageString)
    }
  }

  componentDidUpdate(prevProps: ResultPageProps) {
    const packageString = getPackageStringFromRouter(prevProps.router)
    const nextPackageString = getPackageStringFromRouter(this.props.router)

    if (!nextPackageString) {
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
        this.fetchSimilarPackages(packageString)

        if (this.activeQuery !== packageString) return

        const newPackageString = `${results.name}@${results.version}`
        this.setState(
          {
            inputInitialValue: newPackageString,
            results,
          },
          () => {
            this.activeQuery = newPackageString
            Router.replace(`/package/${newPackageString}`)
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
        if (!result.category.label || result.category.score < 12) {
          return
        }

        const promises = result.category.similar.map(packageName =>
          API.getInfo(packageName)
        )

        Promise.allSettled(promises).then(results => {
          if (this.activeQuery !== packageString) return

          this.setState({
            similarPackagesCategory: result.category.label ?? '',
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
        similarPackagesCategory: '',
      },
      () => {
        this.activeQuery = normalizedQuery
        Router.push(`/package/${normalizedQuery}`)
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
    let name = ''
    let version: string | null | undefined
    let formattedSizeText = ''
    let formattedGZIPSizeText = ''

    if (resultsPromiseState === 'fulfilled' && results) {
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
      const parsedPackage = parsePackageString(
        getPackageStringFromRouter(router)
      )
      name = parsedPackage.name
      version = parsedPackage.version
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
      getResolvedBuildError(resultsError)

    const referenceSpeedInfoText = (speed: number, units: string) =>
      `Download Speed: ⬇️ ${speed} ${units}.\nExclusive of HTTP request latency.`

    const getQuickStatsBar = () =>
      resultsPromiseState === 'fulfilled' &&
      results && (
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
            {resultsPromiseState === 'fulfilled' &&
              results &&
              results.ignoredMissingDependencies &&
              results.ignoredMissingDependencies.length > 0 && (
                <Warning>
                  Ignoring the size of missing{' '}
                  {results.ignoredMissingDependencies.length > 1
                    ? 'dependencies'
                    : 'dependency'}{' '}
                  &nbsp;
                  <code>
                    {formatSentence(results.ignoredMissingDependencies)}
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
            {resultsPromiseState === 'fulfilled' && results && (
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
                dangerouslySetInnerHTML={{ __html: errorBody ?? '' }}
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
            results &&
            results.dependencySizes &&
            results.dependencySizes.length > 0 && (
              <div className="content-container">
                <TreemapSection
                  packageName={results.name}
                  packageSize={results.size}
                  dependencySizes={results.dependencySizes}
                />
              </div>
            )}

          {resultsPromiseState === 'fulfilled' && results && (
            <div className="content-container">
              <ExportAnalysisSection result={results} />
            </div>
          )}

          {resultsPromiseState === 'fulfilled' &&
            results &&
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
            results &&
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
