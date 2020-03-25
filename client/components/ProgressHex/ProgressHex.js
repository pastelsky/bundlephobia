import React, { Component } from 'react'
import ProgressHexAnimator from './progress-hex-timeline'
import './ProgressHex.scss'

class ProgressHex extends Component {
  constructor(props) {
    super(props)
    this.svgRef = React.createRef()
  }

  componentDidMount() {
    this.animator = new ProgressHexAnimator({ svg: this.svgRef.current })
    this.timeline = this.animator.createTimeline()
    this.timeline.play()
  }

  componentWillUnmount() {
    this.timeline.pause()
  }

  render() {
    const { compact } = this.props
    return (
      <svg
        className="progress-hex"
        xmlns="http://www.w3.org/2000/svg"
        width="112"
        height="120"
        viewBox="0 0 112 120"
        ref={this.svgRef}
      >
        {!compact && (
          <g id="ring-5">
            <circle cx="28.99" cy="108.24" r="1" />
            <circle cx="42.98" cy="116" r="1" />
            <circle cx="14.99" cy="100.49" r="1" />
            <circle cx="1" cy="92.73" r="1" />
            <circle cx="58.39" cy="124.54" r="1" />
            <circle cx="1" cy="77.73" r="1" />
            <circle cx="72.72" cy="117.48" r="1" />
            <circle cx="1" cy="62.73" r="1" />
            <circle cx="86.71" cy="110.24" r="1" />
            <circle cx="1.01" cy="45.97" r="1" />
            <circle cx="100.71" cy="101.24" r="1" />
            <circle cx="1.01" cy="30.97" r="1" />
            <circle cx="114.71" cy="94" r="1" />
            <circle cx="15" cy="23.73" r="1" />
            <circle cx="114.71" cy="79" r="1" />
            <circle cx="28.99" cy="15.49" r="1" />
            <circle cx="114.71" cy="63" r="1" />
            <circle cx="42.99" cy="8.24" r="1" />
            <circle cx="114.71" cy="48" r="1" />
            <circle cx="56.98" cy="1" r="1" />
            <circle cx="114.71" cy="33" r="1" />
            <circle cx="100.71" cy="25.24" r="1" />
            <circle cx="86.72" cy="17.48" r="1" />
            <circle cx="72.39" cy="9.54" r="1" />
          </g>
        )}
        <g id="ring-4">
          <circle cx="28.99" cy="93.24" r="1" />
          <circle cx="42.99" cy="101.00" r="1" />
          <circle cx="15.00" cy="85.49" r="1" />
          <circle cx="58.40" cy="109.54" r="1" />
          <circle cx="15.00" cy="70.49" r="1" />
          <circle cx="72.72" cy="102.48" r="1" />
          <circle cx="15.01" cy="53.73" r="1" />
          <circle cx="86.72" cy="93.48" r="1" />
          <circle cx="15.01" cy="38.73" r="1" />
          <circle cx="100.72" cy="86.24" r="1" />
          <circle cx="29.00" cy="31.49" r="1" />
          <circle cx="100.72" cy="71.24" r="1" />
          <circle cx="42.99" cy="23.24" r="1" />
          <circle cx="100.72" cy="55.24" r="1" />
          <circle cx="56.99" cy="16.00" r="1" />
          <circle cx="100.72" cy="40.24" r="1" />
          <circle cx="86.72" cy="32.48" r="1" />
          <circle cx="72.40" cy="24.54" r="1" />
        </g>
        <g id="ring-3">
          <circle cx="29.00" cy="78.24" r="1" />
          <circle cx="42.99" cy="86.00" r="1" />
          <circle cx="58.41" cy="94.54" r="1" />
          <circle cx="29.01" cy="61.49" r="1" />
          <circle cx="72.41" cy="85.54" r="1" />
          <circle cx="29.01" cy="46.49" r="1" />
          <circle cx="86.73" cy="78.48" r="1" />
          <circle cx="43.00" cy="39.24" r="1" />
          <circle cx="86.73" cy="63.48" r="1" />
          <circle cx="56.99" cy="31.00" r="1" />
          <circle cx="86.73" cy="47.48" r="1" />
          <circle cx="72.41" cy="39.54" r="1" />
        </g>
        <g id="ring-2">
          <circle cx="43.00" cy="68.24" r="1" />
          <circle cx="56.99" cy="76.00" r="1" />
          <circle cx="43.00" cy="53.24" r="1" />
          <circle cx="72.41" cy="69.54" r="1" />
          <circle cx="56.99" cy="46.00" r="1" />
          <circle cx="72.41" cy="54.54" r="1" />
        </g>
        <g id="ring-1">
          <circle cx="56" cy="60" r="1" />
        </g>
      </svg>
    )
  }
}

export default ProgressHex
