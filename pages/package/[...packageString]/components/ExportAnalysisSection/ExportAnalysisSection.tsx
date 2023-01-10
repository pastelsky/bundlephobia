import React, { Component, useEffect, useState } from 'react'
import Analytics from '../../../../../client/analytics'
import cx from 'classnames'
import API from '../../../../../client/api'
import SearchIcon from '../../../../../client/components/Icons/SearchIcon'
import JumpingDots from '../../../../../client/components/JumpingDots'
import { formatSize, resolveBuildError } from '../../../../../utils'

const State = {
  TBD: 'tbd',
  IN_PROGRESS: 'in-progress',
  EXPORTS_FULFILLED: 'exports-fulfilled',
  SIZES_FULFILLED: 'sizes-fulfilled',
  REJECTED: 'rejected',
}

const getBGClass = (ratio: number) => {
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

interface ExportPillProps {
  name: string
  size: number
  totalSize: number
  isLoading: boolean
}

const ExportPill: React.FC<ExportPillProps> = ({
  name,
  size,
  totalSize,
  isLoading,
}) => {
  return (
    <li className="export-analysis-section__pill export-analysis-section__dont-break">
      <div
        className={cx(
          'export-analysis-section__pill-fill',
          `export-analysis-section__pill-fill--${getBGClass(size / totalSize)}`
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

interface ExportListProps {
  exports: any[]
  totalSize: number
  isLoading: boolean
}

const ExportList: React.FC<ExportListProps> = ({
  exports,
  totalSize,
  isLoading,
}) => {
  const shouldShowLabels = exports.length > 20
  const exportDictionary: { [x: string]: any[] } = {}
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
                  //   path={exportDictionary[letter][0].path}
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
                  //   path={exp.path}
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

interface InputExportFilterProps {
  onChange: (text: string) => void
}

const InputExportFilter: React.FC<InputExportFilterProps> = ({ onChange }) => {
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

interface ExportAnalysisSectionProps {
  result: {
    description: string
    gzip: number
    hasJSModule: string
    hasJSNext: boolean
    hasSideEffects: boolean
    isModuleType: boolean
    name: string
    parse: any
    peerDependencies: any[]
    repository: string
    scoped: boolean
    size: number
    version: string
  }
}

const ExportAnalysisSection: React.FC<ExportAnalysisSectionProps> = ({
  result,
}) => {
  const [analysisState, setAnalysisState] = useState(State.TBD)
  const [exports, setExports] = useState<{ [x: string]: any[] }>({})
  const [assets, setAssets] = useState([])
  const [filterText, setFilterText] = useState('')
  const [resultError, setResultError] = useState<any>({})

  const getIncompatibleMessage = () => {
    let incompatibleMessage = ''

    if (!(result.hasJSModule || result.hasJSNext || result.isModuleType)) {
      incompatibleMessage = 'This package does not export ES6 modules.'
    } else if (result.hasSideEffects === true) {
      incompatibleMessage =
        "This package exports ES6 modules, but isn't marked side-effect free."
    }
    return incompatibleMessage
  }

  const isCompatible = !getIncompatibleMessage()

  const startAnalysis = () => {
    const { name, version } = result
    const packageString = `${name}@${version}`
    const startTime = Date.now()
    let sizeStartTime: number
    setAnalysisState(State.IN_PROGRESS)

    Analytics.performedExportsAnalysis(packageString)

    API.getExports(packageString)
      .then(
        (results: any) => {
          setExports(results.exports)
          setAnalysisState(State.EXPORTS_FULFILLED)

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
        (results: any) => {
          setAnalysisState(State.SIZES_FULFILLED)
          setAssets(
            results.assets
              .filter((asset: any) => asset.type === 'js')
              .map((asset: any) => ({
                ...asset,
                path: exports[asset.name],
              }))
          )

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
        setAnalysisState(State.REJECTED)
        setResultError(err)
        console.error('Export analysis failed due to ', err)
      })
  }

  useEffect(() => {
    if (isCompatible) {
      startAnalysis()
    }
  }, [isCompatible])

  const handleFilterInputChange = (value: string) => {
    setFilterText(value)
  }

  const renderIncompatible = () => {
    return (
      <p className="export-analysis-section__subtext">
        Exports analysis is available only for packages that export ES Modules
        and are side-effect free. <br />
        {getIncompatibleMessage()}
      </p>
    )
  }

  const renderSuccess = () => {
    const { gzip: totalSize } = result

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
            <InputExportFilter onChange={handleFilterInputChange} />
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

  const renderFailure = () => {
    const { errorName, errorBody, errorDetails } =
      resolveBuildError(resultError)
    return (
      <div className="export-analysis-section__error">
        <h4> {errorName}</h4>
        <p dangerouslySetInnerHTML={{ __html: errorBody }} />
        {errorDetails && <pre>{errorDetails}</pre>}
      </div>
    )
  }
  return (
    <div className="export-analysis-section">
      <h2 className="result__section-heading"> Exports Analysis </h2>

      {getIncompatibleMessage() && renderIncompatible()}
      {analysisState === State.REJECTED && renderFailure()}
      {(analysisState === State.EXPORTS_FULFILLED ||
        analysisState === State.SIZES_FULFILLED) &&
        renderSuccess()}
      {analysisState === State.IN_PROGRESS}
    </div>
  )
}

export default ExportAnalysisSection
