import React, { Component } from 'react'

import squarify from './squarify'

class TreeMap extends Component {
  render() {
    const { width, height, children, ...others } = this.props

    const values = React.Children.map(children, square => square.props.value)

    const squared = squarify(values, width, height, 0, 0)
    const getBorderRadius = index => {
      const topLeftRadius =
        squared[index][0] || squared[index][1] ? '0px' : '10px'
      const topRightRadius =
        squared[index][1] === 0 && squared[index][2] === width ? '10px' : '0px'
      const bottomLeftRadius =
        squared[index][3] === height && squared[index][0] === 0 ? '10px' : '0px'
      const bottomRightRadius =
        Math.round(squared[index][3]) === height &&
        Math.round(squared[index][2]) === width
          ? '10px'
          : '0px'

      return `${topLeftRadius} ${topRightRadius} ${bottomRightRadius} ${bottomLeftRadius}`
    }

    return (
      <div style={{ width: '100%', height, position: 'relative' }} {...others}>
        {React.Children.map(children, (child, index) =>
          React.cloneElement(child, {
            left: `${(squared[index][0] / width) * 100}%`,
            top: `${(squared[index][1] / height) * 100}%`,
            width: `${
              ((squared[index][2] - squared[index][0]) / width) * 100
            }%`,
            height: `${
              ((squared[index][3] - squared[index][1]) / height) * 100
            }%`,
            borderRadius: getBorderRadius(index),
            data: squared[index],
          })
        )}
      </div>
    )
  }
}

function TreemapSquare({
  children,
  left,
  top,
  width,
  height,
  borderRadius,
  data,
  style,
  ...other
}) {
  return (
    <div
      data-vals={data.toString() + '...' + width + '...' + height}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
        wordBreak: 'break-word',
        flexDirection: 'column',
        ...style,
      }}
      {...other}
    >
      {children}
    </div>
  )
}

TreeMap.Square = TreemapSquare

export default TreeMap
