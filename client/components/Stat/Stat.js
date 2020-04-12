import React from 'react'
import cx from 'classnames'
import './Stat.scss'
import { formatSize, formatTime } from 'utils'

const Type = {
  SIZE: 'size',
  TIME: 'time',
}

export default function Stat({
  value,
  label,
  type,
  infoText,
  compact,
  className,
}) {
  const roundedValue =
    type === Type.SIZE
      ? parseFloat(formatSize(value).size.toFixed(1))
      : parseFloat(formatTime(value).size.toFixed(2))

  return (
    <div
      className={cx('stat-container', className, {
        'stat-container--compact': compact,
      })}
    >
      <div className="stat-container__value-container">
        <div className="stat-container__value-wrap">
          <div
            className={cx('stat-container__value', type)}
            style={{ transitionDuration: `${value}s` }}
            data-value={roundedValue}
          >
            {roundedValue}
          </div>
        </div>
        <div className="stat-container__unit">
          {type === Type.SIZE ? formatSize(value).unit : formatTime(value).unit}{' '}
        </div>
      </div>
      <div className="stat-container__divider" />
      <div className="stat-container__footer">
        <div className="stat-container__label">{label}</div>
        {infoText && (
          <div
            className="stat-container__info-text"
            data-balloon-pos="right"
            data-balloon={infoText}
          >
            i
          </div>
        )}
      </div>
    </div>
  )
}

Stat.type = Type
