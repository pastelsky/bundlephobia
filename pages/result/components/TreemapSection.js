import React, { Component } from 'react'
import { formatSize } from 'utils'
import colors from 'client/config/colors'
import Treemap from '../../../client/components/Treemap'

class TreemapSection extends Component {
  state = {
    width: 0,
    height: 0,
  }

  componentDidMount() {
    const { dependencySizes } = this.props
    const width = this.treemapSection.getBoundingClientRect().width
    let heightMultiplier = 1

    if (dependencySizes.length < 5) {
      heightMultiplier = 0.5
    } else if (dependencySizes.length <= 10) {
      heightMultiplier = 0.7
    } else if (dependencySizes.length <= 15) {
      heightMultiplier = 1.1
    }

    let height = 250 * heightMultiplier

    if (window.innerWidth <= 640) {
      height = window.innerHeight * 0.65 * heightMultiplier
    } else if (window.innerWidth <= 768) {
      height = window.innerHeight * 0.45 * heightMultiplier
    }
    this.setState({
      width,
      height,
    })
  }

  render() {
    const { packageName, packageSize, dependencySizes } = this.props
    const { width, height } = this.state

    const getFormattedSize = value => {
      const { size, unit } = formatSize(value)
      return `${size.toFixed(2)} ${unit}`
    }

    let depdendenciesCopy = [...dependencySizes]
    depdendenciesCopy.forEach(dep => {
      if (dep.name === packageName) {
        dep.name = '(self)'
        dep.isSelf = true
      }
    })

    const sizeSum = depdendenciesCopy.reduce(
      (acc, dep) => acc + dep.approximateSize,
      0
    )
    depdendenciesCopy = depdendenciesCopy
      .map(dep => ({
        ...dep,
        percentShare: (dep.approximateSize / sizeSum) * 100,
        // The size given by the API is after performing
        // minimal minification on the dependency source –
        // whitespace removal, dead code removal etc.
        // whereas the displayed size of the package searched by the user
        // is after full minification. We use the ratio from approximate
        // sizes to predict what these dependencies possibly weighed if
        // they were also minified completely instead of partially
        sizeShare: (dep.approximateSize / sizeSum) * packageSize,
      }))
      .map(dep => ({
        ...dep,
        tooltip: `${dep.name} ｜ ${dep.percentShare.toFixed(
          1
        )}% ｜ ~ ${getFormattedSize(dep.sizeShare)}`,
      }))

    depdendenciesCopy.sort((depA, depB) => {
      return depB.percentShare - depA.percentShare
    })

    let compactedDependencies = []

    const compactLimit = window.innerWidth <= 768 ? 8 : 16
    const ellipsizeLimit = window.innerWidth <= 768 ? 3.5 : 1.5
    if (depdendenciesCopy.length > compactLimit) {
      const otherDependencies = depdendenciesCopy.slice(compactLimit)
      compactedDependencies = depdendenciesCopy.slice(0, compactLimit)

      const approximateSize = otherDependencies.reduce(
        (acc, dep) => acc + dep.approximateSize,
        0
      )
      const percentShare = otherDependencies.reduce(
        (acc, dep) => acc + dep.percentShare,
        0
      )
      const sizeShare = otherDependencies.reduce(
        (acc, dep) => acc + dep.sizeShare,
        0
      )

      compactedDependencies.push({
        name: '(others)',
        approximateSize,
        percentShare,
        sizeShare,
        isOthers: true,
        tooltip: otherDependencies
          .map(
            dep =>
              `${dep.name} ｜ ${dep.percentShare.toFixed(
                1
              )}% ｜ ~ ${getFormattedSize(dep.sizeShare)} min`
          )
          .join(' \u000D\u000A  \u000D\u000A '),
      })
    } else {
      compactedDependencies = depdendenciesCopy
    }

    return (
      <section
        className="treemap__section"
        ref={ts => (this.treemapSection = ts)}
      >
        <h2 className="result__section-heading"> Composition </h2>
        <Treemap width={width} height={height} className="treemap">
          {compactedDependencies.map((dep, index) => (
            <Treemap.Square
              key={dep.name}
              value={dep.percentShare}
              style={{ background: colors[index % colors.length] }}
              data-balloon={dep.tooltip}
              data-balloon-pos="top"
              className="treemap__square"
            >
              {dep.percentShare > ellipsizeLimit &&
              dep.name.length < dep.percentShare * (12 / ellipsizeLimit) ? (
                <div>
                  <div className="treemap__label">
                    {dep.isSelf || dep.isOthers ? (
                      <span> {dep.name} </span>
                    ) : (
                      <a href={`/result?p=${dep.name}`} target="_blank">
                        {dep.name}
                      </a>
                    )}
                  </div>
                  <div
                    className="treemap__percent"
                    style={{
                      fontSize: `${
                        14 + Math.min(dep.percentShare * 1.2, 25)
                      }px`,
                    }}
                  >
                    {dep.percentShare.toFixed(1)}
                    <span className="treemap__percent-sign">%</span>
                  </div>
                </div>
              ) : (
                <span className="treemap__ellipsis">&hellip;</span>
              )}
            </Treemap.Square>
          ))}
        </Treemap>
        <p className="treemap__note">
          <b>Note: </b> These sizes represent the contribution made by
          dependencies (direct or transitive) to <code>{packageName}</code>'s
          size. These may be different from the dependencies' standalone sizes.
        </p>
      </section>
    )
  }
}

export default TreemapSection
