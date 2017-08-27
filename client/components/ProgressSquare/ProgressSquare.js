import React, { Component } from 'react'

import stylesheet from './ProgressSquare.scss'

export default class ProgressSquare extends Component {
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

      setTimeout(() => {
        this.props.onDone()
      }, 1000)
    }
  }

  shouldComponentUpdate(props, nextState) {
    return this.state.progressText !== nextState.progressText
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutId)
  }

  getProgressText = (stage) => {
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
      calculating: 0,
    }

    const order = [
      'resolving',
      'building',
      'minifying',
      'calculating',
    ]

    if (this.stage === order.length) {
      this.props.onDone()
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
      <div className="progress-square">
        <style dangerouslySetInnerHTML={ { __html: stylesheet } } />
        <span className="progress-square__loader">
          <span className="progress-square__loader-inner" />
        </span>
        <p className="progress-square__text">
          { progressText }
        </p>
      </div>
    )
  }
}
