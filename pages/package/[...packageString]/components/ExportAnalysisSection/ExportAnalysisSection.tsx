import React, { Component } from 'react'
import cx from 'classnames'

import Analytics from '../../../../../client/analytics'
import API, {
  type PackageBuildInfo,
  type PackageExportAsset,
  type PackageExportsResponse,
  type PackageExportSizesResponse,
} from '../../../../../client/api'
import SearchIcon from '../../../../../client/components/Icons/SearchIcon'
import JumpingDots from '../../../../../client/components/JumpingDots'
import { formatSize, resolveBuildError } from '../../../../../utils'

const State = {
  TBD: 'tbd',
  IN_PROGRESS: 'in-progress',
  EXPORTS_FULFILLED: 'exports-fulfilled',
  SIZES_FULFILLED: 'sizes-fulfilled',
  REJECTED: 'rejected',
} as const

type AnalysisState = (typeof State)[keyof typeof State]

type ExportItem = {
  name: string
  gzip?: number
  path?: string
}

type ExportAnalysisSectionProps = {
  result: PackageBuildInfo
}

type ExportAnalysisSectionState = {
  analysisState: AnalysisState
  exports: Record<string, string>
  assets: ExportItem[]
  filterText: string
  resultError: unknown
}

type ExportPillProps = {
  name: string
  size?: number
  totalSize: number
  isLoading: boolean
}

type ExportListProps = {
  exports: ExportItem[]
  totalSize: number
  isLoading: boolean
}

function getBGClass(ratio: number) {
  if (ratio < 0.05) return 'low-1'
  if (ratio < 0.15) return 'low-2'
  if (ratio < 0.25) return 'med-1'
  if (ratio < 0.4) return 'med-2'
  if (ratio < 0.5) return 'med-3'
  if (ratio < 0.7) return 'high-1'
  return 'high-2'
}

class ExportPill extends React.Component<ExportPillProps> {
  render() {
    const { name, size, totalSize, isLoading } = this.props
    return (
      <li className="export-analysis-section__pill export-analysis-section__dont-break">
        <div
          className={cx(
            'export-analysis-section__pill-fill',
            `export-analysis-section__pill-fill--${getBGClass(
              (size ?? 0) / totalSize
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

function ExportList({ exports, totalSize, isLoading }: ExportListProps) {
  const shouldShowLabels = exports.length > 20
  const exportDictionary: Record<string, ExportItem[]> = {}
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
                  key={exportDictionary[letter][0].name}
                  isLoading={curIndex++ < 40 && isLoading}
                />
              </div>
            )}
            {exportDictionary[letter]
              .slice(shouldShowLabels ? 1 : 0)
              .map(exp => (
                <ExportPill
                  size={exp.gzip}
                  totalSize={totalSize}
                  name={exp.name}
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

function InputExportFilter({
  onChange,
}: {
  onChange: (value: string) => void
}) {
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

export default class ExportAnalysisSection extends Component<
  ExportAnalysisSectionProps,
  ExportAnalysisSectionState
> {
  state: ExportAnalysisSectionState = {
    analysisState: State.TBD,
    exports: {},
    assets: [],
    filterText: '',
    resultError: {},
  }

  componentDidMount() {
    if (!this.getIncompatibleMessage()) {
      this.startAnalysis()
    }
  }

  startAnalysis = () => {
    const { result } = this.props
    const packageString = `${result.name}@${result.version}`
    const startTime = Date.now()
    let sizeStartTime = Date.now()

    this.setState({ analysisState: State.IN_PROGRESS })
    Analytics.performedExportsAnalysis(packageString)

    API.getExports(packageString)
      .then(
        (results: PackageExportsResponse) => {
          this.setState({
            exports: results.exports,
            analysisState: State.EXPORTS_FULFILLED,
          })

          Analytics.exportsAnalysisSuccess({
            packageName: packageString,
            timeTaken: Date.now() - startTime,
          })
        },
        err => {
          Analytics.exportsAnalysisFailure({
            packageName: packageString,
            timeTaken: Date.now() - startTime,
          })
          return Promise.reject(err)
        }
      )
      .then(() => {
        sizeStartTime = Date.now()
        return API.getExportsSizes(packageString)
      })
      .then(
        (results: PackageExportSizesResponse) => {
          this.setState(currentState => ({
            analysisState: State.SIZES_FULFILLED,
            assets: results.assets
              .filter((asset: PackageExportAsset) => asset.type === 'js')
              .map(asset => ({
                ...asset,
                path: currentState.exports[asset.name],
              })),
          }))

          Analytics.exportsSizesSuccess({
            packageName: packageString,
            timeTaken: Date.now() - sizeStartTime,
          })
        },
        err => {
          Analytics.exportsSizesFailure({
            packageName: packageString,
            timeTaken: Date.now() - sizeStartTime,
          })
          return Promise.reject(err)
        }
      )
      .catch(err => {
        this.setState({ analysisState: State.REJECTED, resultError: err })
        console.error('Export analysis failed due to ', err)
      })
  }

  handleFilterInputChange = (value: string) => {
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
    if (!(result.hasJSModule || result.hasJSNext || result.isModuleType)) {
      return 'This package does not export ES6 modules.'
    }
    if (result.hasSideEffects === true) {
      return "This package exports ES6 modules, but isn't marked side-effect free."
    }
    return ''
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

    const normalizedExports: ExportItem[] =
      analysisState === State.SIZES_FULFILLED
        ? assets
        : Object.keys(exports)
            .filter(exp => !exp.startsWith('_'))
            .map(exp => ({ name: exp }))

    const matchedExports = normalizedExports.filter(asset =>
      filterText ? asset.name.toLowerCase().includes(filterText) : true
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
    ) as {
      errorName: string | null
      errorBody: string | null
      errorDetails: string | null
    }

    return (
      <div className="export-analysis-section__error">
        <h4> {errorName}</h4>
        <p dangerouslySetInnerHTML={{ __html: errorBody ?? '' }} />
        {errorDetails && <pre>{errorDetails}</pre>}
      </div>
    )
  }

  render() {
    const { analysisState } = this.state

    return (
      <div className="export-analysis-section">
        <h2 className="result__section-heading"> Exports Analysis </h2>

        {this.getIncompatibleMessage() && this.renderIncompatible()}
        {analysisState === State.REJECTED && this.renderFailure()}
        {(analysisState === State.EXPORTS_FULFILLED ||
          analysisState === State.SIZES_FULFILLED) &&
          this.renderSuccess()}
        {analysisState === State.IN_PROGRESS && this.renderProgress()}
      </div>
    )
  }
}
