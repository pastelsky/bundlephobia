import React, { Component } from 'react'

import ProgressHex from '../ProgressHex'

const OptimisticLoadTimeout = 700

type BuildProgressIndicatorProps = {
  isDone: boolean
  onDone: () => void
}

type BuildProgressIndicatorState = {
  started: boolean
  progressText?: string
}

const order = ['resolving', 'building', 'minifying', 'calculating'] as const

export default class BuildProgressIndicator extends Component<
  BuildProgressIndicatorProps,
  BuildProgressIndicatorState
> {
  stage: number
  timeoutId?: ReturnType<typeof setTimeout>

  constructor(props: BuildProgressIndicatorProps) {
    super(props)
    this.stage = 0
    this.state = {
      started: false,
    }
  }

  componentDidMount() {
    setTimeout(() => {
      if (!this.props.isDone) {
        this.setState({ started: true })
        this.setMessage()
      }
    }, OptimisticLoadTimeout)
  }

  componentWillReceiveProps(nextProps: BuildProgressIndicatorProps) {
    if (nextProps.isDone) {
      this.stage = 3
      this.props.onDone()
    }
  }

  shouldComponentUpdate(
    props: BuildProgressIndicatorProps,
    nextState: BuildProgressIndicatorState
  ) {
    return this.state.progressText !== nextState.progressText
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutId)
  }

  getProgressText = (stage: typeof order[number]) => {
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
    const { progressText, started } = this.state
    if (!started) {
      return null
    }

    return (
      <div className="build-progress-indicator">
        <ProgressHex compact />
        <p className="build-progress-indicator__text">{progressText}</p>
      </div>
    )
  }
}
