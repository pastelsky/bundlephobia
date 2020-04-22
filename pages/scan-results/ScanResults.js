import Router, { withRouter } from 'next/router'
import React, { Component } from 'react'
import Analytics from 'react-ga'
import FlipMove from 'react-flip-move'
import cx from 'classnames'

const PromiseQueue = require('p-queue')
const queryString = require('query-string')
import Stat from 'client/components/Stat'
import Link from 'next/link'
import ResultLayout from '../../client/components/ResultLayout'
import { parsePackageString } from 'utils/common.utils'

import './ScanResults.scss'
import API from 'client/api'
import { getTimeFromSize } from 'utils'

class ResultCard extends Component {
  render() {
    const { pack, index } = this.props

    let content

    switch (pack.promiseState) {
      case 'pending':
        content = (
          <div className="scan-results__loading-text">Calculating &hellip;</div>
        )
        break

      case 'fulfilled':
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
              value={getTimeFromSize(pack.result.gzip).twoG}
              type={Stat.type.TIME}
              label="2G Edge"
              compact
            />
            <Stat
              className="scan-results__stat-item"
              value={getTimeFromSize(pack.result.gzip).threeG}
              type={Stat.type.TIME}
              label="Emerging 3G"
              compact
            />
          </div>
        )
        break

      case 'rejected':
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
          <Link href={`/result?p=${pack.packageString}`}>
            <a>
              <span className="scan-results__package-name"> {pack.name}</span>
              <div>
                {pack.version && (
                  <span className="scan-results__package-version">
                    v{pack.version}
                  </span>
                )}
              </div>
            </a>
          </Link>
        </div>
        {content}
      </li>
    )
  }
}

class ScanResults extends Component {
  constructor(props) {
    super(props)

    const { router } = this.props
    const sortMode = router.query.sortMode
    const packageStrings = router.query.packages
    const packages = packageStrings
      .split(',')
      .map(str => str.trim())
      .map(str => ({
        promiseState: 'pending',
        packageString: str,
        ...parsePackageString(str),
      }))

    this.state = { packages, sortMode: sortMode }
  }

  componentDidMount() {
    const { packages } = this.state
    const queue = new PromiseQueue({ concurrency: 3 })
    const startTime = Date.now()

    packages.forEach(pack => {
      queue.add(() =>
        API.getInfo(pack.packageString)
          .then(result => {
            this.updatePackageState(pack, {
              promiseState: 'fulfilled',
              version: result.version,
              result,
            })

            Analytics.event({
              category: 'Search',
              action: 'Search Success',
              label: pack.packageString.replace(/@/g, '[at]'),
            })
          })
          .catch(({ error }) => {
            console.error(error)
            this.updatePackageState(pack, {
              promiseState: 'rejected',
              error,
            })
            Analytics.event({
              category: 'Scan',
              action: 'Search Failure',
              label: pack.packageString.replace(/@/g, '[at]'),
            })
          })
      )
    })

    queue.onIdle().then(() => {
      const successfulBuildCount = packages.reduce(
        (curSum, nextPack) =>
          nextPack.promiseState === 'fulfilled' ? curSum + 1 : curSum,
        0
      )

      Analytics.set({ metric1: packages.length })
      Analytics.set({ metric2: successfulBuildCount / packages.length })

      Analytics.event({
        category: 'scan',
        action: 'calculation complete',
      })

      Analytics.timing({
        category: 'scan',
        variable: 'scan results',
        value: Date.now() - startTime,
      })
    })

    Analytics.pageview(window.location.pathname)
  }

  updatePackageState(pack, state) {
    const { packages } = this.state
    const packIndex = packages.findIndex(
      ({ packageString }) => packageString === pack.packageString
    )

    packages[packIndex] = {
      ...packages[packIndex],
      ...state,
    }

    this.setState({ packages })
  }

  setParamsAndState = ( sortMode ) => {
    const updatedQuery = { ...this.props.router.query, sortMode}
    Router.replace(`/scan-results?${queryString.stringify(updatedQuery,{encode: false})}`)

    this.setState({ sortMode: sortMode })
  }

  handleSortAlphabetic = () => {
    this.setParamsAndState('alphabetic')
  }

  handleSortSize = () => {
    this.setParamsAndState('size')
  }

  sortPackages = () => {
    const { packages, sortMode } = this.state
    let sortedList

    if (sortMode === 'size') {
      sortedList = packages.sort((packA, packB) => {
        const packASize = packA.result ? packA.result.gzip : 0
        const packBSize = packB.result ? packB.result.gzip : 0

        return packBSize - packASize
      })
    } else {
      sortedList = packages.sort((packA, packB) =>
        packA.name.localeCompare(packB.name)
      )
    }
    return sortedList
  }

  render() {
    const { sortMode } = this.state
    const packages = this.sortPackages()

    const totalMinSize = packages
      .reduce((curTotal, pack) =>
        curTotal + (pack.result ? pack.result.size : 0), 0)

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
              <ResultCard pack={pack} index={index} key={pack.name} />
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
                label="Emerging 3G"
                compact
              />
            </div>
          </li>
        </ul>
        <div className="scan-results__note">
          <b>NOTE:</b> Sizes shown are when importing the complete package.
          Actual sizes might be smaller if only parts of the package are used.
        </div>
      </ResultLayout>
    )
  }
}

export default withRouter(ScanResults)
