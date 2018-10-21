import React, {PureComponent} from 'react'
import Analytics from 'react-ga'
import Head from 'next/head'

import ResultLayout from 'client/components/ResultLayout'
import BarGraph from 'client/components/BarGraph'
import AutocompleteInput from 'client/components/AutocompleteInput'
import AutocompleteInputBox from 'client/components/AutocompleteInputBox'
import ProgressSquare from 'client/components/ProgressSquare/ProgressSquare'
import Router, {withRouter} from 'next/router';
import semver from 'semver'
import isEmptyObject from 'is-empty-object'
import {parsePackageString} from 'utils/common.utils'
import Stat from './Stat'

import API from 'client/api'

import TreemapSection from './TreemapSection'
import EmptyBox from '../../client/assets/empty-box.svg'
import TreeShakeIcon from '../../client/assets/tree-shake.svg'
import stylesheet from './ResultPage.scss'
import SimilarPackagesSection from "./SimilarPackagesSection/SimilarPackagesSection";
import QuickStatsBar from 'client/components/QuickStatsBar/QuickStatsBar'

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

  // Picked up from http://www.webpagetest.org/
  // Speed in KB/s
  static downloadSpeed = {
    TWO_G: 30,     // 2G Edge
    THREE_G: 50    // Emerging markets 3G
  }

  componentDidMount() {
    const { router: { query } } = this.props

    if (query.p && query.p.trim()) {
      this.handleSearchSubmit(query.p)
    }
  }

  componentWillReceiveProps(nextProps) {
    const { router: { query } } = this.props
    const { url: { query: nextQuery } } = nextProps

    if (!nextQuery || !nextQuery.p.trim()) {
      return
    }

    const currentPackage = parsePackageString(query.p)
    const nextPackage = parsePackageString(nextQuery.p)

    if (currentPackage.name !== nextPackage.name) {
      this.handleSearchSubmit(nextQuery.p)
    }
  }

  fetchResults = (packageString) => {
    const startTime = Date.now()

    API.getInfo(packageString)
      .then(results => {
        if (this.activeQuery !== packageString)
          return

        const newPackageString = `${results.name}@${results.version}`
        this.setState({
          inputInitialValue: newPackageString,
          results,
        }, () => {
          Router.replace(`/result?p=${newPackageString}`)
          Analytics.pageview(window.location.pathname)
        })

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
        });
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

  fetchHistory = (packageString) => {
    API.getHistory(packageString)
      .then(results => {
        if (this.activeQuery !== packageString)
          return

        this.setState({
          historicalResultsPromiseState: 'fulfilled',
          historicalResults: results,
        })
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error(err)
      })
  }

  fetchSimilarPackages = (packageString) => {
    const { name } = parsePackageString(packageString)
    const promises = []

    API.getSimilar(name)
      .then(result => {
        if (result.category.label) {
          if (result.category.score < 12) return

          result.category.similar.forEach(packageName => {
            promises.push(API.getInfo(packageName))
          })

          Promise.all(promises)
            .then((results) => {
              if (this.activeQuery !== packageString)
                return

              this.setState({
                similarPackagesCategory: result.category.label,
                similarPackages: results
              })
            })
        }
      })
      .catch(err => {
        this.setState({ historicalResultsPromiseState: 'rejected' })
        console.error(err)
      })
  }

  handleSearchSubmit = (packageString) => {
    Analytics.event({
      category: 'Search',
      action: 'Searched',
      label: packageString.replace(/@/g, '[at]'),
    })

    const normalizedQuery = packageString.trim().toLowerCase()

    this.setState({
      results: {},
      historicalResultsPromiseState: 'pending',
      resultsPromiseState: 'pending',
      inputInitialValue: normalizedQuery,
      similarPackages: [],
      historicalResults: [],
    })


    Router.push(`/result?p=${normalizedQuery}`)

    this.activeQuery = normalizedQuery
    this.fetchResults(normalizedQuery)
    this.fetchHistory(normalizedQuery)
    this.fetchSimilarPackages(normalizedQuery)
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

    const formattedResults = Object.keys(totalVersions)
      .map(version => {
        if (isEmptyObject(totalVersions[version])) {
          return { version, disabled: true }
        }
        return {
          version,
          size: totalVersions[version].size,
          gzip: totalVersions[version].gzip,
        }
      })
    const sorted =
      formattedResults.sort((packageA, packageB) =>
        semver.compare(packageA.version, packageB.version))
    return (typeof window !== 'undefined' && window.innerWidth < 640) ?
      sorted.slice(-10) : sorted
  }

  handleBarClick = (reading) => {
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

    const { router } = this.props
    const getQuickStatsBar = () => resultsPromiseState === 'fulfilled' && (
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
        <style dangerouslySetInnerHTML={{ __html: stylesheet }}/>
        <Head>
          <meta
            property="og:title"
            content={`${router.query.p} | BundlePhobia`}
          />
        </Head>
        {
          resultsPromiseState === 'fulfilled' && (
            <Head>
              <meta
                property="og:title"
                content={`${results.name}@${results.version} | BundlePhobia`}
              />
              <title>
                {results.name}@{results.version} | BundlePhobia
              </title>
            </Head>
          )
        }
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
            {
              resultsPromiseState === 'pending' && (
                <div className="result-pending">
                  <ProgressSquare
                    isDone={!!results.version}
                    onDone={this.handleProgressDone}
                  />
                </div>
              )
            }

            {
              resultsPromiseState === 'fulfilled' && (
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
                          value={results.gzip / 1024 / ResultPage.downloadSpeed.TWO_G}
                          type={Stat.type.TIME}
                          label="2G Edge"
                          infoText={`Download Speed: ⬇️ ${ResultPage.downloadSpeed.TWO_G} kB/s`}
                        />
                        <Stat
                          value={results.gzip / 1024 / ResultPage.downloadSpeed.THREE_G}
                          type={Stat.type.TIME}
                          label="Emerging 3G"
                          infoText={`Download Speed: ⬇️ ${ResultPage.downloadSpeed.THREE_G} kB/s`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="chart-container">
                    {
                      historicalResultsPromiseState === 'fulfilled' && (
                        <BarGraph
                          onBarClick={this.handleBarClick}
                          readings={this.formatHistoricalResults()}
                        />
                      )
                    }
                  </div>
                </div>
              )
            }
          </div>

          {
            resultsPromiseState === 'rejected' && (
              <div className="result-error">
                <EmptyBox className="result-error__img"/>
                <h2 className="result-error__code">
                  {resultsError.error ? resultsError.error.code : 'InternalServerError'}
                </h2>
                <p
                  className="result-error__message"
                  dangerouslySetInnerHTML={{
                    __html: resultsError.error ? resultsError.error.message :
                      'Something went wrong!',
                  }}
                />
                {
                  resultsError.error && resultsError.error.details && resultsError.error.details.originalError && (
                    <details className="result-error__details">
                      <summary> Stacktrace </summary>
                      <pre>
                        {
                          Array.isArray(resultsError.error.details.originalError) ?
                            resultsError.error.details.originalError[0] :
                            resultsError.error.details.originalError.toString()
                        }
                      </pre>
                    </details>
                  )
                }
              </div>
            )
          }
          {
            resultsPromiseState === 'fulfilled' &&
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

          {
            resultsPromiseState === 'fulfilled' &&
            similarPackages.length > 0 && (
              <SimilarPackagesSection
                category={similarPackagesCategory}
                packs={similarPackages}
                comparisonGzip={results.gzip}
              />
            )
          }
        </section>
      </ResultLayout>
    );
  }
};

export default withRouter(ResultPage)