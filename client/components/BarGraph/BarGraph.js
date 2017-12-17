import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import { formatSize } from 'utils/index'
import stylesheet from './BarGraph.scss'


export default class BarGraph extends PureComponent {
  static propTypes = {
    readings: PropTypes.arrayOf(PropTypes.shape({
      version: PropTypes.string.isRequired,
      size: PropTypes.number,
      gzip: PropTypes.number,
      disabled: PropTypes.bool,
    })),
  }

  render() {
    const { readings, onBarClick } = this.props

    const gzipValues = readings
      .filter(reading => !reading.disabled)
      .map(reading => reading.gzip)

    const sizeValues = readings
      .filter(reading => !reading.disabled)
      .map(reading => reading.size)

    const maxValue = Math.max(...[...gzipValues, ...sizeValues])
    const scale = 100 / maxValue

    const getTooltipMessage = (reading) => {
      const formattedSize = formatSize(reading.size)
      const formattedGzip = formatSize(reading.gzip)
      return `Minified: ${parseFloat(formattedSize.size).toFixed(1)}${formattedSize.unit} | Gzipped: ${parseFloat(formattedGzip.size).toFixed(1)}${formattedGzip.unit}`
    }


    return (
      <div className="bar-graph-container">
        <style dangerouslySetInnerHTML={ { __html: stylesheet } } />
        <figure className="bar-graph">
          {
            readings.map((reading, i) => (
              reading.disabled ? (
                <div
                  key={ i }
                  className="bar-graph__bar-group bar-graph__bar-group--disabled"
                  onClick={ () => onBarClick(reading) }
                >
                  <div
                    className="bar-graph__bar"
                    style={ { height: `${ 50 }%` } }
                    data-balloon="Unknown | Click 👆 to build"
                  >
                       <span className="bar-graph__bar-version">
                        { reading.version }
                        </span>
                    <span className="bar-graph__bar-version">
                        { reading.version }
                        </span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={ () => onBarClick(reading) }
                  key={ i } className="bar-graph__bar-group"
                >
                  <div
                    className="bar-graph__bar"
                    style={ { height: `${reading.size * scale}%` } }
                    data-balloon={ getTooltipMessage(reading) }
                  >
                      <span className="bar-graph__bar-version">
                        { reading.version }
                        </span>
                  </div>
                  <div
                    className="bar-graph__bar2"
                    style={ { height: `${reading.gzip * scale}%` } }
                  />
                </div>
              )
            ))
          }
        </figure>
        <div className="bar-graph__legend">
          <div className="bar-graph__legend__bar1">
            <div className="bar-graph__legend__colorbox"/>
            Min
          </div>
          <div className="bar-graph__legend__bar2">
            <div className="bar-graph__legend__colorbox"/>
            GZIP
          </div>
        </div>
      </div>
    )
  }
}

