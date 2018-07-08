import React, {Component} from "react";

import squarify from "./squarify";


class TreeMap extends Component {
  render() {
    const {width, height, children, ...others} = this.props;

    const values = React.Children.map(children, square => square.props.value)

    const squared = squarify(values, width, height, 0, 0);

    return (
      <div style={{width: '100%', height, position: "relative"}} {...others}>
        {
          React.Children.map(children, (child, index) => (
            React.cloneElement(child, {
              left: `${squared[index][0] / width * 100}%`,
              top: `${squared[index][1] / height * 100}%`,
              width: `${(squared[index][2] - squared[index][0]) / width * 100}%`,
              height: `${(squared[index][3] - squared[index][1]) / height * 100}%`
            })
          ))
        }
      </div>
    )
  }
}

function TreemapSquare({children, left, top, width, height, style, ...other}) {
  return (
    <div style={{
      position: "absolute",
      left,
      top,
      width,
      height,
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

export default TreeMap;
