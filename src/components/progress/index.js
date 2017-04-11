import { h, Component } from 'preact'

import style from './style'

export default class Progress extends Component {

  constructor(props) {
    super(props)

    this.stage = 0
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

  shouldComponentUpdate(props, nextState) {
    return (this.state.emoji !== nextState.nextState) ||
      (this.state.progressText !== nextState.progressText)
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

  componentWillUnmount() {
    clearTimeout(this.timeoutId)
  }

  render() {
    const { progressText } = this.state
    return (
      <div className={ style.progress }>
        <span className={ style.loader }>
          <span className={ style.loaderInner } />
        </span>
        <p className={ style.progressText }>
          { progressText } ...
        </p>
      </div>
    )
  }
}
