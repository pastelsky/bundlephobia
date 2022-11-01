import React, { PureComponent } from 'react'
import Head from 'next/head'

import Layout from 'client/components/Layout'
import BarGraph from 'client/components/BarGraph'
import AutocompleteInput from 'client/components/AutocompleteInput'
import BuildProgressIndicator from 'client/components/BuildProgressIndicator'
import Router from 'next/router'
import Link from 'next/link'
import isEmptyObject from 'is-empty-object'
import { parsePackageString } from 'utils/common.utils'

import API from 'client/api'

import GithubLogo from '../../client/assets/github-logo.svg'
import EmptyBox from '../../client/assets/empty-box.svg'

export default class ResultPage extends PureComponent {
  fetchResults = packageString => {
    const startTime = Date.now()

    API.getInfo(packageString)
      .then(results => {
        const newPackageString = `${results.name}@${results.version}`
        this.setState(
          {
            inputInitialValue: newPackageString,
            results,
          },
          () => {
            Router.replace(`/package/${newPackageString}`)
          }
        )
      })
      .catch(err => {
        this.setState({
          resultsError: err,
          resultsPromiseState: 'rejected',
        })
        console.error(err)
      })
  }

  fetchHistory = packageString => {
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

  handleSearchSubmit = packageString => {
    this.setState({
      results: {},
      historicalResultsPromiseState: 'pending',
      resultsPromiseState: 'pending',
    })

    const normalizedQuery = packageString.trim().toLowerCase()

    Router.push(`/package/${normalizedQuery}`)

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

    const formattedResults = Object.keys(totalVersions).map(version => {
      if (isEmptyObject(totalVersions[version])) {
        return { version, disabled: true }
      }
      return {
        version,
        size: totalVersions[version].size,
        gzip: totalVersions[version].gzip,
      }
    })
    const sorted = formattedResults.sort((packageA, packageB) => {
      const versionA = packageA.version.replace(/\D/g, '')
      const versionB = packageB.version.replace(/\D/g, '')
      return parseInt(versionA) > parseInt(versionB)
    })
    return typeof window !== 'undefined' && window.innerWidth < 640
      ? sorted.slice(-10)
      : sorted
  }

  handleBarClick = reading => {
    const { results } = this.state

    const packageString = `${results.name}@${reading.version}`
    this.setState({ inputInitialValue: packageString })
    this.handleSearchSubmit(packageString)
  }

  render() {
    return (
      <Layout className="compare-page">
        <div className="page-container">
          <header className="result-header">
            <section className="result-header--left-section">
              <Link href="/">
                <div className="logo-small">
                  <span>Bundle</span>
                  <span className="logo-small__alt">Phobia</span>
                </div>
              </Link>
            </section>
            <section className="result-header--right-section">
              <a
                target="_blank"
                href="https://github.com/pastelsky/bundlephobia"
              >
                <GithubLogo />
              </a>
            </section>
          </header>
          <div className="compare__search-container">
            <div className="compare__search-inputs">
              <AutocompleteInput
                key={''}
                placeholder="package A"
                initialValue={''}
                onSearchSubmit={this.handleSearchSubmit}
                maxFullSizeCharsMultiplier={0.5}
                hideSearchIcon
              />
              <div className="compare__vs">vs</div>
              <AutocompleteInput
                key={'2'}
                placeholder="package B"
                initialValue={''}
                onSearchSubmit={this.handleSearchSubmit}
                maxFullSizeCharsMultiplier={0.5}
                hideSearchIcon
              />
            </div>
          </div>
        </div>
      </Layout>
    )
  }
}
