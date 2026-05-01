import React, { Component, createRef } from 'react'

import colors from 'client/config/colors'
import { Treemap, TreemapSquare } from 'client/components/Treemap'
import { formatSize } from 'utils'

type DependencySize = {
  name: string
  approximateSize: number
}

type TreemapDependency = DependencySize & {
  isSelf?: boolean
  isOthers?: boolean
  percentShare: number
  sizeShare: number
  tooltip: string
}

type TreemapSectionProps = {
  packageName: string
  packageSize: number
  dependencySizes: DependencySize[]
}

type TreemapSectionState = {
  width: number
  height: number
}

class TreemapSection extends Component<
  TreemapSectionProps,
  TreemapSectionState
> {
  state: TreemapSectionState = {
    width: 0,
    height: 0,
  }

  private treemapSectionRef = createRef<HTMLElement>()

  componentDidMount() {
    const { dependencySizes } = this.props
    const width =
      this.treemapSectionRef.current?.getBoundingClientRect().width ?? 0
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

  getFormattedSize = (value: number) => {
    const { size, unit } = formatSize(value)
    return `${size.toFixed(2)} ${unit}`
  }

  getCompactThresholds() {
    if (typeof window === 'undefined') {
      return {
        compactLimit: 16,
        ellipsizeLimit: 1.5,
      }
    }

    return window.innerWidth <= 768
      ? {
          compactLimit: 8,
          ellipsizeLimit: 3.5,
        }
      : {
          compactLimit: 16,
          ellipsizeLimit: 1.5,
        }
  }

  getDependencies(): TreemapDependency[] {
    const { packageName, packageSize, dependencySizes } = this.props

    const dependencies = dependencySizes
      .map(dep => ({
        ...dep,
        name: dep.name === packageName ? '(self)' : dep.name,
        isSelf: dep.name === packageName,
      }))
      .sort((depA, depB) => depB.approximateSize - depA.approximateSize)

    const sizeSum = dependencies.reduce(
      (acc, dep) => acc + dep.approximateSize,
      0
    )

    if (sizeSum === 0) {
      return []
    }

    return dependencies
      .map(dep => ({
        ...dep,
        percentShare: (dep.approximateSize / sizeSum) * 100,
        sizeShare: (dep.approximateSize / sizeSum) * packageSize,
      }))
      .map(dep => ({
        ...dep,
        tooltip: `${dep.name} ｜ ${dep.percentShare.toFixed(
          1
        )}% ｜ ~ ${this.getFormattedSize(dep.sizeShare)}`,
      }))
      .sort((depA, depB) => depB.percentShare - depA.percentShare)
  }

  getCompactedDependencies(dependencies: TreemapDependency[]) {
    const { compactLimit } = this.getCompactThresholds()

    if (dependencies.length <= compactLimit) {
      return dependencies
    }

    const otherDependencies = dependencies.slice(compactLimit)
    const compactedDependencies = dependencies.slice(0, compactLimit)

    compactedDependencies.push({
      name: '(others)',
      approximateSize: otherDependencies.reduce(
        (acc, dep) => acc + dep.approximateSize,
        0
      ),
      percentShare: otherDependencies.reduce(
        (acc, dep) => acc + dep.percentShare,
        0
      ),
      sizeShare: otherDependencies.reduce((acc, dep) => acc + dep.sizeShare, 0),
      isOthers: true,
      tooltip: otherDependencies
        .map(
          dep =>
            `${dep.name} ｜ ${dep.percentShare.toFixed(
              1
            )}% ｜ ~ ${this.getFormattedSize(dep.sizeShare)} min`
        )
        .join(' \u000D\u000A  \u000D\u000A '),
    })

    return compactedDependencies
  }

  render() {
    const { packageName } = this.props
    const { width, height } = this.state
    const { ellipsizeLimit } = this.getCompactThresholds()
    const compactedDependencies = this.getCompactedDependencies(
      this.getDependencies()
    )

    return (
      <section className="treemap__section" ref={this.treemapSectionRef}>
        <h2 className="result__section-heading"> Composition </h2>
        <Treemap width={width} height={height} className="treemap">
          {compactedDependencies.map((dep, index) => (
            <TreemapSquare
              key={dep.name}
              value={dep.percentShare}
              style={{ background: colors[index % colors.length] }}
              data-balloon={dep.tooltip}
              data-balloon-pos="top"
              className="treemap__square"
            >
              {dep.percentShare > ellipsizeLimit &&
              dep.name.length < dep.percentShare * (12 / ellipsizeLimit) ? (
                <div className="treemap__content">
                  <div className="treemap__label">
                    {dep.isSelf || dep.isOthers ? (
                      <span> {dep.name} </span>
                    ) : (
                      <a
                        href={`/package/${dep.name}`}
                        target="_blank"
                        rel="noreferrer"
                      >
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
            </TreemapSquare>
          ))}
        </Treemap>
        <p className="treemap__note">
          <b>Note: </b> These sizes represent the contribution made by
          dependencies (direct or transitive) to <code>{packageName}</code>
          &apos;s size. These may be different from the dependencies&apos;
          standalone sizes.
        </p>
      </section>
    )
  }
}

export default TreemapSection
