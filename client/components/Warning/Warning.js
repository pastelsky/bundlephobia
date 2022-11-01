import React, { Component } from 'react'

class Warning extends Component {
  render() {
    return <div className="warning-bar">{this.props.children}</div>
  }
}

export default Warning
