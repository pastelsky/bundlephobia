import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import { formatSize } from 'utils/index'
import TreeShakeIcon from '../Icons/TreeShakeIcon'
import SideEffectIcon from '../Icons/SideEffectIcon'
import './BarGraph.scss'

export default class BarGraph extends PureComponent {
  static propTypes = {
    onBarClick: PropTypes.func.isRequired,
    readings: PropTypes.arrayOf(
      PropTypes.shape({
        version: PropTypes.string.isRequired,
        size: PropTypes.number,
        gzip: PropTypes.number,
        disabled: PropTypes.bool,
      })
    ),
  }

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
      reading => !reading.disabled && (reading.hasJSModule || reading.hasJSNext)
    )

    return treeshakingIntroducedRecently ? firstTreeshakingIndex : -1
  }

  renderDisabledBar = reading => (
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
      <div className="bar-graph__bar-version" key={reading.version}>
        {reading.version}
      </div>
    </div>
  )

  renderActiveBar = (reading, scale, options) => {
    const getTooltipMessage = reading => {
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
                reading.hasJSNext || reading.hasJSModule
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
        <div className="bar-graph__bar-version" key={reading.version}>
          {reading.version}
        </div>
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
