import Link from 'next/link'
import Router from 'next/router'
import React, { PureComponent } from 'react'

import API, {
  type PackageBuildInfo,
  type PackageHistoryResponse,
} from '../../client/api'
import EmptyBox from '../../client/assets/empty-box.svg'
import GithubLogo from '../../client/assets/github-logo.svg'
import BuildProgressIndicator from '../../client/components/BuildProgressIndicator'
import BarGraph, {
  type Reading,
} from '../../client/components/BarGraph/BarGraph'
import Layout from '../../client/components/Layout'
import { AutocompleteInput } from '../../client/components/AutocompleteInput'
import { parsePackageString } from '../../utils/common.utils'

type ComparePageState = {
  results: PackageBuildInfo | null
  resultsError: unknown
  resultsPromiseState: 'pending' | 'fulfilled' | 'rejected' | null
  historicalResultsPromiseState: 'pending' | 'fulfilled' | 'rejected' | null
  historicalResults: PackageHistoryResponse
  inputInitialValue?: string
}

export default class ComparePage extends PureComponent<
  Record<string, never>,
  ComparePageState
> {
  state: ComparePageState = {
    results: null,
    resultsError: null,
    resultsPromiseState: null,
    historicalResultsPromiseState: null,
    historicalResults: {},
  }

  fetchResults = (packageString: string) => {
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

  fetchHistory = (packageString: string) => {
    API.getHistory(packageString, 15)
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

  handleSearchSubmit = (packageString: string) => {
    this.setState({
      results: null,
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
      if (!reading || Object.keys(reading).length === 0) {
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

    const sorted = formattedResults.sort((packageA, packageB) => {
      const versionA = Number(packageA.version.replace(/\D/g, ''))
      const versionB = Number(packageB.version.replace(/\D/g, ''))
      return versionA - versionB
    })

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
                rel="noreferrer"
              >
                <GithubLogo />
              </a>
            </section>
          </header>
          <div className="compare__search-container">
            <div className="compare__search-inputs">
              <AutocompleteInput
                key=""
                initialValue=""
                onSearchSubmit={this.handleSearchSubmit}
              />
              <div className="compare__vs">vs</div>
              <AutocompleteInput
                key="2"
                initialValue=""
                onSearchSubmit={this.handleSearchSubmit}
              />
            </div>
          </div>
          {this.state.resultsPromiseState === 'pending' && (
            <BuildProgressIndicator
              isDone={!!this.state.results?.version}
              onDone={this.handleProgressDone}
            />
          )}
          {this.state.historicalResultsPromiseState === 'fulfilled' &&
            this.state.results && (
              <BarGraph
                readings={this.formatHistoricalResults()}
                onBarClick={this.handleBarClick}
              />
            )}
          {this.state.resultsPromiseState === 'rejected' && (
            <div className="result-error">
              <EmptyBox className="result-error__img" />
              <h2 className="result-error__code">
                {parsePackageString(this.state.inputInitialValue ?? '').name}
              </h2>
            </div>
          )}
        </div>
      </Layout>
    )
  }
}
