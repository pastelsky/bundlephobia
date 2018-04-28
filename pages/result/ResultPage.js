import React, { PureComponent } from 'react'
import Analytics from 'react-ga'
import Head from 'next/head'

import ResultLayout from 'client/components/ResultLayout'
import BarGraph from 'client/components/BarGraph'
import AutocompleteInput from 'client/components/AutocompleteInput'
import ProgressSquare from 'client/components/ProgressSquare/ProgressSquare'
import Router from 'next/router'
import semver from 'semver'
import isEmptyObject from 'is-empty-object'
import { parsePackageString } from 'utils/common.utils'
import Stat from './Stat'

import API from 'client/api'

import EmptyBox from '../../assets/empty-box.svg'
import stylesheet from './ResultPage.scss'

export default class ResultPage extends PureComponent {
  state = {
    results: {},
    resultsPromiseState: null,
    resultsError: null,
    historicalResultsPromiseState: null,
    inputInitialValue: this.props.url.query.p || '',
    historicalResults: [],
  }

  // Picked up from http://www.webpagetest.org/
  // Speed in KB/s
  static downloadSpeed = {
    TWO_G: 30,     // 2G Edge
    THREE_G: 50    // Emerging markets 3G
  }
  i = 0

  componentDidMount() {
    const { url: { query } } = this.props

    if (query.p && query.p.trim()) {
      this.handleSearchSubmit(query.p)
    }
  }

  componentWillReceiveProps(nextProps) {
    const { url: { query } } = this.props
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

  handleSearchSubmit = (packageString) => {
    Analytics.event({
      category: 'Search',
      action: 'Searched',
      label: packageString.replace(/@/g, '[at]'),
    })

    this.setState({
      results: {},
      historicalResultsPromiseState: 'pending',
      resultsPromiseState: 'pending',
    })

    const normalizedQuery = packageString.trim().toLowerCase()

    Router.push(`/result?p=${normalizedQuery}`)

    this.fetchResults(normalizedQuery)
    this.fetchHistory(normalizedQuery)
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
    } = this.state

    const { url } = this.props

    return (
      <ResultLayout>
        <style dangerouslySetInnerHTML={ { __html: stylesheet } } />
        <Head>
          <meta
            property="og:title"
            content={ `${url.query.p} | BundlePhobia` }
          />
        </Head>
        {
          resultsPromiseState === 'fulfilled' && (
            <Head>
              <meta
                property="og:title"
                content={ `${results.name}@${results.version} | BundlePhobia` }
              />
              <title>
                { results.name }@{ results.version } | BundlePhobia
              </title>
            </Head>
          )
        }
        <AutocompleteInput
          key={ inputInitialValue }
          initialValue={ inputInitialValue }
          className="result-page__search-input"
          onSearchSubmit={ this.handleSearchSubmit }
        />
        {
          resultsPromiseState === 'pending' && (
            <ProgressSquare
              isDone={ !!results.version }
              onDone={ this.handleProgressDone }
            />
          )
        }
        {
          resultsPromiseState === 'fulfilled' &&
          (results.hasJSModule || results.hasJSNext) && (
            <div className="flash-message">
                <span className="flash-message__info-icon">
                  i
                </span>
              <span>
                supports the&nbsp;
                <code>
                  { results.hasJSModule ? 'module' : 'jsnext:main' }
                </code>
                &nbsp;field. You can get smaller sizes with
                &nbsp;
                <a target="_blank"
                   href="http://2ality.com/2017/04/setting-up-multi-platform-packages.html#support-by-bundlers">tree shaking</a>.
                </span>
            </div>
          )
        }
        {
          resultsPromiseState === 'fulfilled' && (
            <section className="content-container">
              <div className="stats-container">
                <div className="size-container">
                  <h3> Bundle Size </h3>
                  <div className="size-stats">
                    <Stat
                      value={ results.size }
                      type={ Stat.type.SIZE }
                      label="Minified"
                    />
                    <Stat
                      value={ results.gzip }
                      type={ Stat.type.SIZE }
                      label="Minified + Gzipped"
                    />
                  </div>
                </div>
                <div className="time-container">
                  <h3> Download Time </h3>
                  <div className="time-stats">
                    <Stat
                      value={ results.gzip / 1024 / ResultPage.downloadSpeed.TWO_G }
                      type={ Stat.type.TIME }
                      label="2G Edge"
                      infoText={ `Download Speed: ⬇️ ${ResultPage.downloadSpeed.TWO_G} kB/s` }
                    />
                    <Stat
                      value={ results.gzip / 1024 / ResultPage.downloadSpeed.THREE_G }
                      type={ Stat.type.TIME }
                      label="Emerging 3G"
                      infoText={ `Download Speed: ⬇️ ${ResultPage.downloadSpeed.THREE_G} kB/s` }
                    />
                  </div>
                </div>
              </div>
              <div className="chart-container">
                {
                  historicalResultsPromiseState === 'fulfilled' && (
                    <BarGraph
                      onBarClick={ this.handleBarClick }
                      readings={ this.formatHistoricalResults() }
                    />
                  )
                }
              </div>
            </section>
          )
        }
        {
          resultsPromiseState === 'rejected' && (
            <div className="result-error">
              <EmptyBox className="result-error__img" />
              <h2 className="result-error__code">
                { resultsError.error ? resultsError.error.code : 'InternalServerError' }
              </h2>
              <p
                className="result-error__message"
                dangerouslySetInnerHTML={ {
                  __html: resultsError.error ? resultsError.error.message :
                    'Something went wrong!',
                } }
              />
            </div>
          )
        }
      </ResultLayout>
    )
  }
}