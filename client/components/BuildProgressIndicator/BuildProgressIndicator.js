import React, { Component } from 'react'

import ProgressHex from '../ProgressHex'
import './BuildProgressIndicator.scss'

export default class BuildProgressIndicator extends Component {
  constructor(props) {
    super(props)
    this.stage = 0
    this.state = {}
  }

  componentDidMount() {
    this.setMessage()
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.isDone) {
      this.stage = 3
      this.props.onDone()
    }
  }

  shouldComponentUpdate(props, nextState) {
    return this.state.progressText !== nextState.progressText
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutId)
  }

  getProgressText = stage => {
    const progressText = {
      resolving: 'Resolving version and dependencies',
      building: 'Bundling package',
      minifying: 'Minifying, GZipping',
      calculating: 'Calculating file sizes',
    }
    return progressText[stage]
  }

  setMessage = (stage = 0) => {
    const timings = {
      resolving: 3 + Math.random() * 2,
      building: 5 + Math.random() * 3,
      minifying: 3 + Math.random() * 2,
      calculating: 20,
    }

    const order = ['resolving', 'building', 'minifying', 'calculating']

    if (this.stage === order.length) {
      //this.props.onDone()
      return
    }

    this.setState({
      progressText: this.getProgressText(order[this.stage]),
    })

    this.timeoutId = setTimeout(() => {
      if (this.stage < order.length) {
        this.stage += 1
      }

      this.setMessage(this.stage)
    }, timings[order[stage]] * 1000)
  }

  render() {
    const { progressText } = this.state
    return (
      <div className="build-progress-indicator">
        <ProgressHex compact />
        <p className="build-progress-indicator__text">{progressText}</p>
      </div>
    )
  }
}
