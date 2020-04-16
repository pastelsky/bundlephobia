import React, { Component } from 'react'
import Analytics from 'react-ga'
import cx from 'classnames'
import API from 'client/api'
import SearchIcon from 'client/components/Icons/SearchIcon'
import JumpingDots from 'client/components/JumpingDots'
import { formatSize, resolveBuildError } from 'utils'

import './ExportAnalysisSection.scss'

const State = {
  TBD: 'tbd',
  IN_PROGRESS: 'in-progress',
  EXPORTS_FULFILLED: 'exports-fulfilled',
  SIZES_FULFILLED: 'sizes-fulfilled',
  REJECTED: 'rejected',
}

function getBGClass(ratio) {
  if (ratio < 0.05) {
    return 'low-1'
  } else if (ratio < 0.15) {
    return 'low-2'
  } else if (ratio < 0.25) {
    return 'med-1'
  } else if (ratio < 0.4) {
    return 'med-2'
  } else if (ratio < 0.5) {
    return 'med-3'
  } else if (ratio < 0.7) {
    return 'high-1'
  } else {
    return 'high-2'
  }
}

class ExportPill extends React.Component {
  render() {
    const { name, size, path, totalSize, isLoading } = this.props
    return (
      <li className="export-analysis-section__pill export-analysis-section__dont-break">
        <div
          className={cx(
            'export-analysis-section__pill-fill',
            `export-analysis-section__pill-fill--${getBGClass(
              size / totalSize
            )}`
          )}
          style={{
            transform: `scaleX(${Math.min((size || 0) / totalSize, 1)})`,
          }}
        />
        <div className="export-analysis-section__pill-name"> {name} </div>
        {isLoading && <div className="export-analysis-section__pill-spinner" />}
        {size && (
          <div className="export-analysis-section__pill-size">
            {formatSize(size).size.toFixed(1)}
            <span className="export-analysis-section__pill-size-unit">
              {formatSize(size).unit}
            </span>
          </div>
        )}
      </li>
    )
  }
}

function ExportList({ exports, totalSize, isLoading }) {
  const shouldShowLabels = exports.length > 20
  const exportDictionary = {}
  let curIndex = 0

  exports.forEach(exp => {
    const firstLetter = exp.name[0].toLowerCase()
    if (exportDictionary[firstLetter]) {
      exportDictionary[firstLetter].push(exp)
    } else {
      exportDictionary[firstLetter] = [exp]
    }
  })

  return (
    <ul className="export-analysis-section__list">
      {Object.keys(exportDictionary)
        .sort()
        .map(letter => (
          <div className="export-analysis-section__letter-group" key={letter}>
            {shouldShowLabels && (
              <div className="export-analysis-section__dont-break">
                <h3 className="export-analysis-section__letter-heading">
                  {letter}
                </h3>
                <ExportPill
                  size={exportDictionary[letter][0].gzip}
                  totalSize={totalSize}
                  name={exportDictionary[letter][0].name}
                  path={exportDictionary[letter][0].path}
                  key={exportDictionary[letter][0].name}
                  isLoading={curIndex++ < 40 && isLoading}
                />
              </div>
            )}
            {exportDictionary[letter]
              .slice(shouldShowLabels ? 1 : 0)
              .map((exp, expIndex) => (
                <ExportPill
                  size={exp.gzip}
                  totalSize={totalSize}
                  name={exp.name}
                  path={exp.path}
                  key={exp.name}
                  isLoading={curIndex++ < 40 && isLoading}
                />
              ))}
          </div>
        ))}
      <div className="export-analysis-section__overflow-indicator" />
    </ul>
  )
}

function InputExportFilter({ onChange }) {
  return (
    <div className="export-analysis-section__filter-input-container">
      <input
        placeholder="Filter methods"
        className="export-analysis-section__filter-input"
        type="text"
        onChange={e => onChange(e.target.value.toLowerCase().trim())}
      />
      <SearchIcon className="export-analysis-section__filter-input-search-icon" />
    </div>
  )
}

class ExportAnalysisSection extends Component {
  state = {
    analysisState: State.TBD,
    exports: {},
    assets: [],
    filterText: '',
    resultError: {},
  }

  componentDidMount() {
    const isCompatible = !this.getIncompatibleMessage()

    if (isCompatible) {
      this.startAnalysis()
    }
  }

  startAnalysis = () => {
    const { result } = this.props
    const { name, version } = result
    const packageString = `${name}@${version}`
    this.setState({ analysisState: State.IN_PROGRESS })

    API.getExports(packageString)
      .then(
        results => {
          this.setState({
            exports: results.exports,
            analysisState: State.EXPORTS_FULFILLED,
          })

          Analytics.event({
            category: 'Export Analysis',
            action: 'Exports Fetch Success',
            label: packageString.replace(/@/g, '[at]'),
          })
        },
        err => {
          Analytics.event({
            category: 'Export Analysis',
            action: 'Exports Fetch Failed',
            label: packageString.replace(/@/g, '[at]'),
          })
          return Promise.reject(err)
        }
      )
      .then(() => API.getExportsSizes(packageString))
      .then(
        results => {
          this.setState({
            analysisState: State.SIZES_FULFILLED,
            assets: results.assets
              .filter(asset => asset.type === 'js')
              .map(asset => ({
                ...asset,
                path: this.state.exports[asset.name],
              })),
          })

          Analytics.event({
            category: 'Export Analysis',
            action: 'Exports Sizes Success',
            label: packageString.replace(/@/g, '[at]'),
          })
        },
        err => {
          Analytics.event({
            category: 'Export Analysis',
            action: 'Exports Sized Failed',
            label: packageString.replace(/@/g, '[at]'),
          })
          return Promise.reject(err)
        }
      )
      .catch(err => {
        this.setState({ analysisState: State.REJECTED, resultError: err })
        console.error('Export analysis failed due to ', err)
      })
  }

  handleFilterInputChange = value => {
    this.setState({ filterText: value })
  }

  renderProgress() {
    const { result } = this.props
    return (
      <div className="export-analysis-section__progress-container">
        Fetching all named exports in&nbsp;<code>{result.name}</code>{' '}
        <JumpingDots />
      </div>
    )
  }

  getIncompatibleMessage() {
    const { result } = this.props
    let incompatibleMessage = ''

    if (!(result.hasJSModule || result.hasJSNext)) {
      incompatibleMessage = 'This package does not export ES6 modules.'
    } else if (result.hasSideEffects === true) {
      incompatibleMessage =
        "This package exports ES6 modules, but isn't marked side-effect free."
    }
    return incompatibleMessage
  }

  renderIncompatible() {
    return (
      <p className="export-analysis-section__subtext">
        Exports analysis is available only for packages that export ES Modules
        and are side-effect free. <br />
        {this.getIncompatibleMessage()}
      </p>
    )
  }

  renderSuccess() {
    const { result } = this.props
    const { gzip: totalSize } = result
    const { exports, analysisState, assets, filterText } = this.state

    const normalizedExports =
      analysisState === State.SIZES_FULFILLED
        ? assets
        : Object.keys(exports)
            .filter(exp => !exp.startsWith('_'))
            .map(exp => ({ name: exp }))

    const matchedExports = normalizedExports.filter(asset =>
      !!filterText ? asset.name.toLowerCase().includes(filterText) : true
    )

    return (
      <>
        <div className="export-analysis-section__topbar">
          <p className="export-analysis-section__subtext export-analysis-section__infotext">
            GZIP sizes of individual exports
          </p>
          {normalizedExports.length > 15 && (
            <InputExportFilter onChange={this.handleFilterInputChange} />
          )}
        </div>

        <ExportList
          isLoading={analysisState === State.EXPORTS_FULFILLED}
          totalSize={totalSize}
          exports={matchedExports}
        />
      </>
    )
  }

  renderFailure() {
    const { errorName, errorBody, errorDetails } = resolveBuildError(
      this.state.resultError
    )
    return (
      <div className="export-analysis-section__error">
        <h4> {errorName}</h4>
        <p dangerouslySetInnerHTML={{ __html: errorBody }} />
        {errorDetails && <pre>{errorDetails}</pre>}
      </div>
    )
  }

  render() {
    const { analysisState } = this.state

    return (
      <div className="export-analysis-section">
        <h2 className="result__section-heading result__section-heading--new">
          {' '}
          Exports Analysis{' '}
        </h2>

        {this.getIncompatibleMessage() && this.renderIncompatible()}
        {analysisState === State.REJECTED && this.renderFailure()}
        {(analysisState === State.EXPORTS_FULFILLED ||
          analysisState === State.SIZES_FULFILLED) &&
          this.renderSuccess()}
        {analysisState === State.IN_PROGRESS}
      </div>
    )
  }
}

export default ExportAnalysisSection
