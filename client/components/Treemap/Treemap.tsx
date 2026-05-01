import React, { Component } from 'react'

import squarify, { type TreemapRectangle } from './squarify'

type TreeMapProps = {
  width: number
  height: number
} & React.PropsWithChildren &
  React.HTMLAttributes<HTMLDivElement>

type TreemapChildProps = {
  value: number
}

class TreeMap extends Component<TreeMapProps> {
  render() {
    const { width, height, children, ...others } = this.props

    const squares = React.Children.toArray(children).filter(
      (child): child is React.ReactElement<TreemapChildProps> =>
        React.isValidElement<TreemapChildProps>(child)
    )
    const values = squares.map(square => square.props.value)

    const squared = squarify(values, width, height, 0, 0)
    const getBorderRadius = (square: TreemapRectangle) => {
      const topLeftRadius = square[0] || square[1] ? '0px' : '10px'
      const topRightRadius =
        square[1] === 0 && square[2] === width ? '10px' : '0px'
      const bottomLeftRadius =
        square[3] === height && square[0] === 0 ? '10px' : '0px'
      const bottomRightRadius =
        Math.round(square[3]) === height && Math.round(square[2]) === width
          ? '10px'
          : '0px'

      return `${topLeftRadius} ${topRightRadius} ${bottomRightRadius} ${bottomLeftRadius}`
    }

    return (
      <div style={{ width: '100%', height, position: 'relative' }} {...others}>
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) {
            return child
          }

          const childProps = {
            left: `${(squared[index][0] / width) * 100}%`,
            top: `${(squared[index][1] / height) * 100}%`,
            width: `${
              ((squared[index][2] - squared[index][0]) / width) * 100
            }%`,
            height: `${
              ((squared[index][3] - squared[index][1]) / height) * 100
            }%`,
            borderRadius: getBorderRadius(squared[index]),
            data: squared[index],
          }

          return React.cloneElement(child, childProps)
        })}
      </div>
    )
  }
}

export default TreeMap
