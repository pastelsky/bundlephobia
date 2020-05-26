import React, { PureComponent } from 'react'
import Analytics from 'react-ga'
import Head from 'next/head'

import ResultLayout from 'client/components/ResultLayout'
import BarGraph from 'client/components/BarGraph'
import AutocompleteInput from 'client/components/AutocompleteInput'
import AutocompleteInputBox from 'client/components/AutocompleteInputBox'
import BuildProgressIndicator from 'client/components/BuildProgressIndicator'
import Router, { withRouter } from 'next/router'
import semver from 'semver'
import isEmptyObject from 'is-empty-object'
import { parsePackageString } from 'utils/common.utils'
import { getTimeFromSize, DownloadSpeed, resolveBuildError } from 'utils'
import Stat from 'client/components/Stat'

import API from 'client/api'

import TreemapSection from './components/TreemapSection'
import EmptyBox from '../../client/assets/empty-box.svg'
import SimilarPackagesSection from './components/SimilarPackagesSection'
import ExportAnalysisSection from './components/ExportAnalysisSection'
import QuickStatsBar from 'client/components/QuickStatsBar/QuickStatsBar'

import './ResultPage.scss'
import Warning from 'client/components/Warning/Warning'
import arrayToSentence from 'array-to-sentence'

class ResultPage extends PureComponent {
  state = {
    results: {},
    resultsPromiseState: null,
    resultsError: null,
    historicalResultsPromiseState: null,
    inputInitialValue: this.props.router.query.p || '',
    historicalResults: [],
    similarPackages: [],
    similarPackagesCategory: '',
  }

  componentDidMount() {
    const {
      router: { query },
    } = this.props

    if (query.p && query.p.trim()) {
      this.handleSearchSubmit(query.p)
    }
  }

  componentWillReceiveProps(nextProps) {
    const {
      router: { query },
    } = this.props
    const {
      url: { query: nextQuery },
    } = nextProps

    if (!nextQuery || !nextQuery.p.trim()) {
      return
    }

    const currentPackage = parsePackageString(query.p)
    const nextPackage = parsePackageString(nextQuery.p)

    if (currentPackage.name !== nextPackage.name) {
      this.handleSearchSubmit(nextQuery.p)
    }
  }

  fetchResults = packageString => {
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
            Router.replace(`/result?p=${newPackageString}`)
            Analytics.pageview(window.location.pathname)
          }
        )

        Analytics.event({
          category: 'Search',
          action: 'Search Success',
          label: packageString.replace(/@/g, '[at]'),
        })

        Analytics.timing({
          category: 'Search',
          variable: 'result',
          value: Date.now() - startTime,
          label: packageString.replace(/@/g, '[at]'),
        })
      })
      .catch(err => {
        this.setState({
          resultsError: err,
          resultsPromiseState: 'rejected',
        })
        console.error(err)

        Analytics.event({
          category: 'Search',
          action: 'Search Failure',
          label: packageString.replace(/@/g, '[at]'),
        })

        Analytics.exception({
          description: err.error ? err.error.code : err.toString(),
        })
      })
  }

  fetchHistory = packageString => {
    API.getHistory(packageString)
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

  fetchSimilarPackages = packageString => {
    const { name } = parsePackageString(packageString)
    const promises = []

    API.getSimilar(name)
      .then(result => {
        if (result.category.label) {
          if (result.category.score < 12) return

          result.category.similar.forEach(packageName => {
            promises.push(API.getInfo(packageName))
          })

          Promise.all(promises).then(results => {
            if (this.activeQuery !== packageString) return

            this.setState({
              similarPackagesCategory: result.category.label,
              similarPackages: results,
            })
          })
        }
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error(err)
      })
  }

  handleSearchSubmit = packageString => {
    Analytics.event({
      category: 'Search',
      action: 'Searched',
      label: packageString.replace(/@/g, '[at]'),
    })

    const normalizedQuery = packageString.trim().toLowerCase()

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
        Router.push(`/result?p=${normalizedQuery}`)
        this.activeQuery = normalizedQuery
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
    this.handleSearchSubmit(packageString)

    Analytics.event({
      category: 'Graph',
      action: reading.disabled ? 'Graph Disabled Bar Click' : 'Graph Bar Click',
      label: packageString.replace(/@/g, '[at]'),
    })
  }

  getMetaTags = () => {
    const { url } = this.props
    const { resultsPromiseState, results } = this.state
    let name, version

    if (resultsPromiseState === 'fulfilled') {
      name = results.name
      version = results.version
    } else {
      name = parsePackageString(url.query.p).name
      version = parsePackageString(url.query.p).version
    }

    const packageString = version ? `${name}@${version}` : name
    const origin =
      typeof window === 'undefined'
        ? 'https://bundlephobia.com'
        : window.location.origin

    return (
      <Head>
        <meta
          property="og:title"
          key="og:title"
          content={`${packageString} ❘ BundlePhobia`}
        />
        <title key="title">{packageString} | BundlePhobia</title>
        <meta
          property="og:image"
          key="og:image"
          content={
            origin +
            `/api/stats-image?name=${name}&version=${version}&wide=true`
          }
        />
        <meta
          property="twitter:title"
          key="twitter:title"
          content={`${name} v${version} ❘ BundlePhobia`}
        />
        {name && version && (
          <meta
            name="twitter:card"
            key="twitter:card"
            content="summary_large_image"
          />
        )}
      </Head>
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

    const { errorName, errorBody, errorDetails } = resolveBuildError(
      resultsError
    )

    const getQuickStatsBar = () =>
      resultsPromiseState === 'fulfilled' && (
        <QuickStatsBar
          description={results.description}
          dependencyCount={results.dependencyCount}
          hasSideEffects={results.hasSideEffects}
          isTreeShakeable={results.hasJSModule || results.hasJSNext}
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
                        value={getTimeFromSize(results.gzip).twoG}
                        type={Stat.type.TIME}
                        label="2G Edge"
                        infoText={`Download Speed: ⬇️ ${DownloadSpeed.TWO_G} kB/s`}
                      />
                      <Stat
                        value={getTimeFromSize(results.gzip).threeG}
                        type={Stat.type.TIME}
                        label="Emerging 3G"
                        infoText={`Download Speed: ⬇️ ${DownloadSpeed.THREE_G} kB/s`}
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

          {resultsPromiseState === 'fulfilled' && similarPackages.length > 0 && (
            <div className="content-container">
              <SimilarPackagesSection
                category={similarPackagesCategory}
                packs={similarPackages}
                comparisonGzip={results.gzip}
              />
            </div>
          )}
        </section>
      </ResultLayout>
    )
  }
}

export default withRouter(ResultPage)
