import Link from 'next/link'
import Router, { withRouter, type NextRouter } from 'next/router'
import React, { Component } from 'react'
import FlipMove from 'react-flip-move'
import cx from 'classnames'
import PQueue from 'p-queue'
import { stringify } from 'query-string'

import Analytics from '../../client/analytics'
import API, { type PackageBuildInfo } from '../../client/api'
import Stat from '../../client/components/Stat'
import ResultLayout from '../../client/components/ResultLayout'
import { parsePackageString } from '../../utils/common.utils'
import { getTimeFromSize } from '../../utils'

type PromiseState = 'pending' | 'fulfilled' | 'rejected'
type SortMode = 'alphabetic' | 'size'

type PackageBuildError = {
  code: string
  message: string
}

type ParsedPackage = ReturnType<typeof parsePackageString>

type ScanPackage = ParsedPackage & {
  promiseState: PromiseState
  packageString: string
  result?: PackageBuildInfo
  error?: PackageBuildError
}

type ResultCardProps = {
  pack: ScanPackage
  index: number
}

type ScanResultsProps = {
  router: NextRouter
}

type ScanResultsState = {
  packages: ScanPackage[]
  sortMode: SortMode
}

function getQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getPackagesFromRouter(router: NextRouter): ScanPackage[] {
  const packageStrings = getQueryValue(router.query.packages)

  if (!packageStrings) {
    return []
  }

  return packageStrings
    .split(',')
    .map(str => str.trim())
    .filter(Boolean)
    .map(str => ({
      promiseState: 'pending' as const,
      packageString: str,
      ...parsePackageString(str),
    }))
}

function getSortModeFromRouter(router: NextRouter): SortMode {
  const sortMode = getQueryValue(router.query.sortMode)
  return sortMode === 'size' ? 'size' : 'alphabetic'
}

class ResultCard extends Component<ResultCardProps> {
  render() {
    const { pack, index } = this.props

    let content: React.ReactNode = null

    switch (pack.promiseState) {
      case 'pending':
        content = (
          <div className="scan-results__loading-text">Calculating &hellip;</div>
        )
        break

      case 'fulfilled':
        if (!pack.result) {
          break
        }

        content = (
          <div className="scan-results__stat-container">
            <Stat
              className="scan-results__stat-item"
              value={pack.result.size}
              type={Stat.type.SIZE}
              label="Min"
              compact
            />
            <Stat
              className="scan-results__stat-item"
              value={pack.result.gzip}
              type={Stat.type.SIZE}
              label="Min + GZIP"
              compact
            />
            <Stat
              className="scan-results__stat-item"
              value={getTimeFromSize(pack.result.gzip).threeG}
              type={Stat.type.TIME}
              label="Slow 3G"
              compact
            />
            <Stat
              className="scan-results__stat-item"
              value={getTimeFromSize(pack.result.gzip).fourG}
              type={Stat.type.TIME}
              label="Emerging 4G"
              compact
            />
          </div>
        )
        break

      case 'rejected':
        if (!pack.error) {
          break
        }

        content = (
          <details className="scan-results__error-text">
            <summary> {pack.error.code}</summary>
            <p dangerouslySetInnerHTML={{ __html: pack.error.message }} />
          </details>
        )
        break
    }

    return (
      <li
        className={cx('scan-results__item', {
          'scan-results__item--loading': pack.promiseState === 'pending',
          'scan-results__item--error': pack.promiseState === 'rejected',
        })}
      >
        <div className="scan-results__index">
          <span> {index + 1}. </span>
        </div>
        <div className="scan-results__name" data-name={pack.name}>
          <Link href={`/package/${pack.packageString}`}>
            <span className="scan-results__package-name"> {pack.name}</span>
            <div>
              {pack.version && (
                <span className="scan-results__package-version">
                  v{pack.version}
                </span>
              )}
            </div>
          </Link>
        </div>
        {content}
      </li>
    )
  }
}

class ScanResults extends Component<ScanResultsProps, ScanResultsState> {
  state: ScanResultsState = {
    packages: getPackagesFromRouter(this.props.router),
    sortMode: getSortModeFromRouter(this.props.router),
  }

  // Disables Next.js's Automatic Static Optimization
  // which causes query params to be empty
  // see https://nextjs.org/docs/routing/dynamic-routes#caveats
  static async getInitialProps() {
    return {}
  }

  componentDidMount() {
    const { packages } = this.state
    const queue = new PQueue({ concurrency: 3 })
    const startTime = Date.now()

    Analytics.pageView('scan results')

    packages.forEach(pack => {
      const packageStartTime = Date.now()

      queue.add(() =>
        API.getInfo(pack.packageString)
          .then(result => {
            this.updatePackageState(pack.packageString, {
              promiseState: 'fulfilled',
              version: result.version,
              result,
            })

            Analytics.searchSuccess({
              packageName: pack.packageString,
              timeTaken: Date.now() - packageStartTime,
            })
          })
          .catch(({ error }: { error: PackageBuildError }) => {
            console.error(error)
            this.updatePackageState(pack.packageString, {
              promiseState: 'rejected',
              error,
            })

            Analytics.searchFailure({
              packageName: pack.packageString,
              timeTaken: Date.now() - packageStartTime,
            })
          })
      )
    })

    queue.onIdle().then(() => {
      this.setState(currentState => {
        const successfulBuildCount = currentState.packages.reduce(
          (curSum, nextPack) =>
            nextPack.promiseState === 'fulfilled' ? curSum + 1 : curSum,
          0
        )

        Analytics.scanCompleted({
          successRatio:
            currentState.packages.length === 0
              ? 0
              : successfulBuildCount / currentState.packages.length,
          timeTaken: Date.now() - startTime,
        })

        return null
      })
    })
  }

  updatePackageState(packageString: string, state: Partial<ScanPackage>) {
    this.setState(currentState => ({
      packages: currentState.packages.map(pack =>
        pack.packageString === packageString ? { ...pack, ...state } : pack
      ),
    }))
  }

  setParamsAndState = (sortMode: SortMode) => {
    const updatedQuery = { ...this.props.router.query, sortMode }
    Router.replace(
      `/scan-results?${stringify(updatedQuery, { encode: false })}`
    )

    this.setState({ sortMode })
  }

  handleSortAlphabetic = () => {
    this.setParamsAndState('alphabetic')
  }

  handleSortSize = () => {
    this.setParamsAndState('size')
  }

  sortPackages = () => {
    const { packages, sortMode } = this.state
    const packagesCopy = [...packages]

    if (sortMode === 'size') {
      return packagesCopy.sort((packA, packB) => {
        const packASize = packA.result ? packA.result.gzip : 0
        const packBSize = packB.result ? packB.result.gzip : 0

        return packBSize - packASize
      })
    }

    return packagesCopy.sort((packA, packB) =>
      packA.name.localeCompare(packB.name)
    )
  }

  render() {
    const { sortMode } = this.state
    const packages = this.sortPackages()

    const totalMinSize = packages.reduce(
      (curTotal, pack) => curTotal + (pack.result ? pack.result.size : 0),
      0
    )

    const totalGZIPSize = packages.reduce(
      (curTotal, pack) => curTotal + (pack.result ? pack.result.gzip : 0),
      0
    )

    return (
      <ResultLayout className="scan-results">
        <h1> Results</h1>
        <div className="scan-results__sort-panel">
          <label> Sort By: </label>
          <button
            className={cx({
              'scan-results__sort--selected': sortMode === 'alphabetic',
            })}
            onClick={this.handleSortAlphabetic}
          >
            Name: A &rarr; Z
          </button>
          <button
            className={cx({
              'scan-results__sort--selected': sortMode === 'size',
            })}
            onClick={this.handleSortSize}
          >
            Size: High &rarr; Low
          </button>
        </div>
        <ul className="scan-results__container">
          <FlipMove
            duration={350}
            easing="cubic-bezier(0.175, 0.885, 0.325, 1.040)"
          >
            {packages.map((pack, index) => (
              <ResultCard pack={pack} index={index} key={pack.packageString} />
            ))}
          </FlipMove>
          <li className="scan-results__item scan-results__item--total">
            <div className="scan-results__name">Total</div>
            <div className="scan-results__stat-container">
              <Stat
                className="scan-results__stat-item"
                value={totalMinSize}
                type={Stat.type.SIZE}
                label="Min"
                compact
              />
              <Stat
                className="scan-results__stat-item"
                value={totalGZIPSize}
                type={Stat.type.SIZE}
                label="Min + GZIP"
                compact
              />
              <Stat
                className="scan-results__stat-item"
                value={totalGZIPSize / 1024 / 30}
                type={Stat.type.TIME}
                label="2G Edge"
                compact
              />
              <Stat
                className="scan-results__stat-item"
                value={totalGZIPSize / 1024 / 50}
                type={Stat.type.TIME}
                label="Slow 3G"
                compact
              />
            </div>
          </li>
        </ul>
        <div className="scan-results__note">
          <b>NOTE:</b> Sizes shown are when importing the complete package.
          Actual sizes might be smaller if only parts of the package are used or
          if packages share common dependencies. This is not a substitute for
          bundle size.
        </div>
      </ResultLayout>
    )
  }
}

export default withRouter(ScanResults)
