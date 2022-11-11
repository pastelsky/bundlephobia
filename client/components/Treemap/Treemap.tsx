import React, { Component } from 'react'

import squarify from './squarify'

type TreeMapProps = {
  width: number
  height: number
} & React.PropsWithChildren &
  React.HTMLAttributes<HTMLDivElement>

export class TreeMap extends Component<TreeMapProps> {
  render() {
    const { width, height, children, ...others } = this.props

    const values = React.Children.map(children, square =>
      React.isValidElement(square) ? square.props.value : square
    )

    const squared = squarify(values, width, height, 0, 0)
    const getBorderRadius = (index: number) => {
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
            borderRadius: getBorderRadius(index),
            data: squared[index],
          }

          return React.cloneElement(child, childProps)
        })}
      </div>
    )
  }
}
