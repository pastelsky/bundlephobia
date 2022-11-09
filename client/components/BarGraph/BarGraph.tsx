import React, { PureComponent } from 'react'

import { formatSize } from '../../../utils'
import TreeShakeIcon from '../Icons/TreeShakeIcon'
import SideEffectIcon from '../Icons/SideEffectIcon'
import { BarVersion } from '../BarVersion/BarVersion'

export type Reading = {
  version: string
  size: number
  gzip: number
  disabled: boolean
  hasSideEffects: boolean
  hasJSModule: boolean
  hasJSNext: boolean
  isModuleType: boolean
}

type BarGraphProps = {
  readings: Reading[]
  onBarClick: (reading: Reading) => void
}

export default class BarGraph extends PureComponent<BarGraphProps> {
  getScale = () => {
    const { readings } = this.props

    const gzipValues = readings
      .filter(reading => !reading.disabled)
      .map(reading => reading.gzip)

    const sizeValues = readings
      .filter(reading => !reading.disabled)
      .map(reading => reading.size)

    const maxValue = Math.max(...[...gzipValues, ...sizeValues])
    return 100 / maxValue
  }

  getFirstSideEffectFreeIndex = () => {
    const { readings } = this.props
    const sideEffectFreeIntroducedRecently = !readings.every(
      reading => !reading.hasSideEffects
    )
    const firstSideEffectFreeIndex = readings.findIndex(
      reading => !(reading.disabled || reading.hasSideEffects)
    )

    return sideEffectFreeIntroducedRecently ? firstSideEffectFreeIndex : -1
  }

  getFirstTreeshakeableIndex = () => {
    const { readings } = this.props
    const treeshakingIntroducedRecently = !readings.every(
      reading => reading.hasJSModule
    )
    const firstTreeshakingIndex = readings.findIndex(
      reading =>
        !reading.disabled &&
        (reading.hasJSModule || reading.hasJSNext || reading.isModuleType)
    )

    return treeshakingIntroducedRecently ? firstTreeshakingIndex : -1
  }

  renderDisabledBar = (reading: Reading) => (
    <div
      key={reading.version}
      className="bar-graph__bar-group bar-graph__bar-group--disabled"
      onClick={() => this.props.onBarClick(reading)}
    >
      <div
        className="bar-graph__bar"
        style={{ height: `${50}%` }}
        data-balloon="Unknown | Click 👆 to build"
      />
      <BarVersion version={reading.version} />
    </div>
  )

  renderActiveBar = (
    reading: Reading,
    scale: number,
    options: { isFirstTreeshakeable: boolean; isFirstSideEffectFree: boolean }
  ) => {
    const getTooltipMessage = (reading: Reading) => {
      const formattedSize = formatSize(reading.size)
      const formattedGzip = formatSize(reading.gzip)
      return `Minified: ${parseFloat(formattedSize.size).toFixed(1)}${
        formattedSize.unit
      } | Gzipped: ${parseFloat(formattedGzip.size).toFixed(1)}${
        formattedGzip.unit
      }`
    }

    return (
      <div
        onClick={() => this.props.onBarClick(reading)}
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
          style={{ height: `${(reading.size - reading.gzip) * scale}%` }}
          data-balloon={getTooltipMessage(reading)}
        />
        <div
          className="bar-graph__bar2"
          style={{ height: `${reading.gzip * scale}%` }}
          data-balloon={getTooltipMessage(reading)}
        />
        <BarVersion version={reading.version} />
      </div>
    )
  }

  render() {
    const { readings } = this.props
    const graphScale = this.getScale()
    const firstTreeshakeableIndex = this.getFirstTreeshakeableIndex()
    const firstSideEffectFreeIndex = this.getFirstSideEffectFreeIndex()

    return (
      <div className="bar-graph-container">
        <figure className="bar-graph">
          {readings.map((reading, index) =>
            reading.disabled
              ? this.renderDisabledBar(reading)
              : this.renderActiveBar(reading, graphScale, {
                  isFirstTreeshakeable: index === firstTreeshakeableIndex,
                  isFirstSideEffectFree: index === firstSideEffectFreeIndex,
                })
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
}
