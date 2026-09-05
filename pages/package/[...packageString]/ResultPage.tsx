import Router, { withRouter, type NextRouter } from 'next/router'
import React, { PureComponent } from 'react'
import semver from 'semver'

import Analytics from '../../../client/analytics'
import API, {
  type PackageBuildInfo,
  type PackageHistoryResponse,
} from '../../../client/api'
import EmptyBox from '../../../client/assets/empty-box.svg'
import { AutocompleteInput } from '../../../client/components/AutocompleteInput'
import AutocompleteInputBox from '../../../client/components/AutocompleteInputBox'
import BarGraph from '../../../client/components/BarGraph'
import { type Reading } from '../../../client/components/BarGraph/BarGraph'
import BuildProgressIndicator from '../../../client/components/BuildProgressIndicator'
import CarbonAd from '../../../client/components/CarbonAd'
import MetaTags, {
  DEFAULT_DESCRIPTION_START,
} from '../../../client/components/MetaTags'
import QuickStatsBar from '../../../client/components/QuickStatsBar/QuickStatsBar'
import ResultLayout from '../../../client/components/ResultLayout'
import Stat from '../../../client/components/Stat'
import Warning from '../../../client/components/Warning/Warning'
import {
  parsePackageString,
  sanitizeErrorHTML,
} from '../../../utils/common.utils'
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
  historicalResults: PackageHistoryResponse | null
  similarPackages: PackageBuildInfo[]
  similarPackagesCategory: string
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
  private searchRequestId = 0

  private isActiveSearch = (requestId: number) =>
    requestId === this.searchRequestId

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

  fetchResults = (packageString: string, requestId: number) => {
    const startTime = Date.now()

    API.getInfo(packageString)
      .then(results => {
        if (!this.isActiveSearch(requestId)) return

        this.fetchSimilarPackages(packageString, requestId)

        const newPackageString = `${results.name}@${results.version}`
        this.setState(
          {
            inputInitialValue: newPackageString,
            results,
          },
          () => {
            this.activeQuery = newPackageString

            if (
              getPackageStringFromRouter(this.props.router) !== newPackageString
            ) {
              Router.replace(`/package/${newPackageString}`)
            }
          },
        )

        Analytics.searchSuccess({
          packageName: packageString,
          timeTaken: Date.now() - startTime,
        })
      })
      .catch(err => {
        if (!this.isActiveSearch(requestId)) return

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

  fetchHistory = (packageString: string, requestId: number) => {
    API.getHistory(packageString, 15)
      .then(results => {
        if (!this.isActiveSearch(requestId)) return

        this.setState({
          historicalResultsPromiseState: 'fulfilled',
          historicalResults: results,
        })
      })
      .catch(err => {
        if (!this.isActiveSearch(requestId)) return

        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error('Fetching history failed:', err)
      })
  }

  fetchSimilarPackages = (packageString: string, requestId: number) => {
    const { name } = parsePackageString(packageString)

    API.getSimilar(name)
      .then(result => {
        if (!this.isActiveSearch(requestId)) return

        if (!result.category.label || result.category.score < 12) {
          return
        }

        const promises = result.category.similar.map(packageName =>
          API.getInfo(packageName),
        )

        Promise.allSettled(promises).then(results => {
          if (!this.isActiveSearch(requestId)) return

          this.setState({
            similarPackagesCategory: result.category.label ?? '',
            similarPackages: results
              .filter(
                (
                  settledResult,
                ): settledResult is PromiseFulfilledResult<PackageBuildInfo> =>
                  settledResult.status === 'fulfilled',
              )
              .map(settledResult => settledResult.value),
          })
        })
      })
      .catch(err => {
        if (!this.isActiveSearch(requestId)) return

        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error(err)
      })
  }

  handleSearchSubmit = (packageString: string) => {
    Analytics.performedSearch(packageString)
    const normalizedQuery = packageString.trim()
    const requestId = ++this.searchRequestId

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
        if (!this.isActiveSearch(requestId)) return

        this.activeQuery = normalizedQuery

        const navigation =
          getPackageStringFromRouter(this.props.router) === normalizedQuery
            ? Promise.resolve(true)
            : Router.push(`/package/${normalizedQuery}`)

        navigation.then(() => {
          if (!this.isActiveSearch(requestId)) return

          Analytics.pageView('package result')
          this.fetchResults(normalizedQuery, requestId)
          this.fetchHistory(normalizedQuery, requestId)
        })
      },
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

    const formattedByVersion = new Map(
      (historicalResults?.versions ?? []).map(reading => [
        reading.version,
        {
          version: reading.version,
          disabled: !reading.built,
          size: reading.size ?? 0,
          gzip: reading.gzip ?? 0,
          hasSideEffects: false,
          hasJSModule: false,
          hasJSNext: false,
          isModuleType: false,
        },
      ]),
    )
    formattedByVersion.set(results.version, {
      version: results.version,
      disabled: false,
      size: results.size,
      gzip: results.gzip,
      hasSideEffects: Boolean(results.hasSideEffects),
      hasJSModule: Boolean(results.hasJSModule),
      hasJSNext: Boolean(results.hasJSNext),
      isModuleType: Boolean(results.isModuleType),
    })

    const sorted = Array.from(formattedByVersion.values()).sort((packageA, packageB) =>
      semver.compare(packageA.version, packageB.version),
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
    let name: string
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
        getPackageStringFromRouter(router),
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

  referenceSpeedInfoText = (speed: number, units: string) =>
    `Download Speed: ⬇️ ${speed} ${units}.\nExclusive of HTTP request latency.`

  renderQuickStatsBar() {
    const { resultsPromiseState, results } = this.state

    if (resultsPromiseState !== 'fulfilled' || !results) return null

    return (
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
  }

  renderPendingResult() {
    if (this.state.resultsPromiseState !== 'pending') return null

    return (
      <div className="result-pending">
        <BuildProgressIndicator
          isDone={!!this.state.results?.version}
          onDone={this.handleProgressDone}
        />
      </div>
    )
  }

  renderMissingDependencyWarning() {
    const results = this.state.results

    if (
      this.state.resultsPromiseState !== 'fulfilled' ||
      !results?.ignoredMissingDependencies?.length
    ) {
      return null
    }

    return (
      <Warning>
        Ignoring the size of missing{' '}
        {results.ignoredMissingDependencies.length > 1
          ? 'dependencies'
          : 'dependency'}{' '}
        &nbsp;
        <code>{formatSentence(results.ignoredMissingDependencies)}</code>.
        <a
          href="https://github.com/pastelsky/bundlephobia#1-why-does-search-for-package-x-throw-missingdependencyerror-"
          target="_blank"
          rel="noreferrer"
        >
          Read more
        </a>
      </Warning>
    )
  }

  renderStats() {
    const { resultsPromiseState, results, historicalResultsPromiseState } =
      this.state

    if (resultsPromiseState !== 'fulfilled' || !results) return null

    return (
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
                infoText={this.referenceSpeedInfoText(
                  DownloadSpeed.THREE_G,
                  'kB/s',
                )}
              />
              <Stat
                value={getTimeFromSize(results.gzip).fourG}
                type={Stat.type.TIME}
                label="Emerging 4G"
                infoText={this.referenceSpeedInfoText(
                  DownloadSpeed.FOUR_G,
                  'kB/s',
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
    )
  }

  renderErrorResult() {
    if (this.state.resultsPromiseState !== 'rejected') return null

    const { errorName, errorBody, errorDetails } = resolveBuildError(
      this.state.resultsError,
    )

    return (
      <div className="result-error">
        <EmptyBox className="result-error__img" />
        <h2 className="result-error__code">{errorName}</h2>
        <p
          className="result-error__message"
          dangerouslySetInnerHTML={{
            __html: sanitizeErrorHTML(errorBody ?? ''),
          }}
        />
        {errorDetails && (
          <details className="result-error__details">
            <summary>Details</summary>
            <pre>{errorDetails}</pre>
          </details>
        )}
      </div>
    )
  }

  renderTreemap() {
    const { resultsPromiseState, results } = this.state

    if (
      resultsPromiseState !== 'fulfilled' ||
      !results?.dependencySizes?.length
    ) {
      return null
    }

    return (
      <div className="content-container">
        <TreemapSection
          packageName={results.name}
          packageSize={results.size}
          dependencySizes={results.dependencySizes}
        />
      </div>
    )
  }

  renderExports() {
    const { resultsPromiseState, results } = this.state

    if (resultsPromiseState !== 'fulfilled' || !results) return null

    return (
      <div className="content-container">
        <ExportAnalysisSection result={results} />
      </div>
    )
  }

  renderSimilarPackages() {
    const {
      resultsPromiseState,
      results,
      similarPackages,
      similarPackagesCategory,
    } = this.state

    if (
      resultsPromiseState !== 'fulfilled' ||
      !results ||
      similarPackages.length === 0
    ) {
      return null
    }

    return (
      <div className="content-container">
        <SimilarPackagesSection
          category={similarPackagesCategory}
          packs={similarPackages}
          comparisonGzip={results.gzip}
        />
      </div>
    )
  }

  renderInterLinks() {
    const { resultsPromiseState, results } = this.state

    if (
      resultsPromiseState !== 'fulfilled' ||
      !results ||
      !parsePackageString(results.name).scoped
    ) {
      return null
    }

    return <InterLinksSection packageName={results.name} />
  }

  renderCarbonAd() {
    if (this.state.resultsPromiseState !== 'fulfilled' || !this.state.results) {
      return null
    }

    return <CarbonAd className="result-page__carbon-ad" />
  }

  render() {
    return (
      <ResultLayout>
        {this.getMetaTags()}
        <section className="content-container-wrap">
          <div className="content-container">
            <AutocompleteInputBox footer={this.renderQuickStatsBar()}>
              <AutocompleteInput
                key={this.state.inputInitialValue}
                initialValue={this.state.inputInitialValue}
                className="result-page__search-input"
                onSearchSubmit={this.handleSearchSubmit}
                renderAsH1
              />
            </AutocompleteInputBox>
            {this.renderPendingResult()}
            {this.renderMissingDependencyWarning()}
            {this.renderStats()}
          </div>
          {this.renderErrorResult()}
          {this.renderTreemap()}
          {this.renderExports()}
          {this.renderCarbonAd()}
          {this.renderSimilarPackages()}
          {this.renderInterLinks()}
        </section>
      </ResultLayout>
    )
  }
}

export const getServerSideProps = () => {
  return { props: {} }
}

export default withRouter(ResultPage)
