import React, { useMemo } from 'react'

import { formatSize } from '../../../utils'
import TreeShakeIcon from '../Icons/TreeShakeIcon'
import SideEffectIcon from '../Icons/SideEffectIcon'
import { BarVersion } from '../BarVersion'
import { Reading } from './types'
import { useBarGraph } from './hooks/useBarGraph'

interface BarGraphProps {
  readings: Reading[]
  onBarClick: (reading: Reading) => void
}

export function BarGraph({ onBarClick, readings }: BarGraphProps) {
  const { firstSideEffectFreeIndex, firstTreeshakeableIndex, graphScale } =
    useBarGraph({ readings })

  return (
    <div className="bar-graph-container">
      <figure className="bar-graph">
        {readings.map((reading, index) =>
          reading.disabled ? (
            <DisabledBar
              key={reading.version}
              reading={reading}
              onBarClick={onBarClick}
            />
          ) : (
            <ActiveBar
              key={reading.version}
              reading={reading}
              graphScale={graphScale}
              options={{
                isFirstTreeshakeable: index === firstTreeshakeableIndex,
                isFirstSideEffectFree: index === firstSideEffectFreeIndex,
              }}
              onBarClick={onBarClick}
            />
          )
        )}
      </figure>
      <div className="bar-graph__legend">
        <div className="bar-graph__legend__bar1">
          <div className="bar-graph__legend__colorbox" />
          Min
        </div>
        <div className="bar-graph__legend__bar2">
          <div className="bar-graph__legend__colorbox" />
          GZIP
        </div>
      </div>
    </div>
  )
}

interface DisabledBarProps {
  reading: Reading
  onBarClick: (reading: Reading) => void
}

function DisabledBar({ reading, onBarClick }: DisabledBarProps) {
  return (
    <div
      key={reading.version}
      className="bar-graph__bar-group bar-graph__bar-group--disabled"
      onClick={() => onBarClick(reading)}
    >
      <div
        className="bar-graph__bar"
        style={{ height: `${50}%` }}
        data-balloon="Unknown | Click 👆 to build"
      />
      <BarVersion version={reading.version} />
    </div>
  )
}

interface ActiveBarProps {
  reading: Reading
  graphScale: number
  options: { isFirstTreeshakeable: boolean; isFirstSideEffectFree: boolean }
  onBarClick: (reading: Reading) => void
}

function ActiveBar({
  reading,
  options,
  graphScale,
  onBarClick,
}: ActiveBarProps) {
  const tooltipMessage = useMemo(() => {
    const formattedSize = formatSize(reading.size)
    const formattedGzip = formatSize(reading.gzip)
    return `Minified: ${parseFloat(formattedSize.size).toFixed(1)}${
      formattedSize.unit
    } | Gzipped: ${parseFloat(formattedGzip.size).toFixed(1)}${
      formattedGzip.unit
    }`
  }, [reading])

  return (
    <div
      onClick={() => onBarClick(reading)}
      key={reading.version}
      className="bar-graph__bar-group"
    >
      <div className="bar-graph__bar-symbols">
        {options.isFirstTreeshakeable && (
          <div
            data-balloon={`ES2015 exports introduced. ${
              reading.hasSideEffects
                ? 'Not side-effect free yet, hence limited tree-shake ability.'
                : ''
            }`}
            className="bar-graph__bar-symbol"
          >
            <TreeShakeIcon />
          </div>
        )}
        {options.isFirstSideEffectFree && (
          <div
            data-balloon={`Was marked side-effect free. ${
              reading.hasJSNext || reading.hasJSModule || reading.isModuleType
                ? 'Supports ES2015 exports also, hence fully tree-shakeable'
                : "Doesn't export ESM yet, limited tree-shake ability"
            }`}
            className="bar-graph__bar-symbol"
          >
            <SideEffectIcon />
          </div>
        )}
      </div>

      <div
        className="bar-graph__bar"
        style={{ height: `${(reading.size - reading.gzip) * graphScale}%` }}
        data-balloon={tooltipMessage}
      />
      <div
        className="bar-graph__bar2"
        style={{ height: `${reading.gzip * graphScale}%` }}
        data-balloon={tooltipMessage}
      />
      <BarVersion version={reading.version} />
    </div>
  )
}
