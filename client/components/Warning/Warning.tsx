import React, { Component } from 'react'

class Warning extends Component<React.PropsWithChildren> {
  render() {
    return <div className="warning-bar">{this.props.children}</div>
  }
}

export default Warning
