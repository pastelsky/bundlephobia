import { h, Component } from 'preact'
import prettyBytes from '../../lib/prettyBytes'
import P from 'proptypes'
import AutoComplete from 'react-autocomplete'
import debounce from 'debounce'
import cx from 'classnames'
import ProgressBar from '../progress'
import SearchTags from '../searchTags'

import fetch from 'unfetch'
import style from './style'

export default class Home extends Component {
  state = {
    value: '',
    suggestions: [],
    rotation: 0,
    results: {},
  }

  handleInputChange = ({ target }) => {
    this.setState({ value: target.value })
    const trimmedValue = target.value.trim()
    console.log(trimmedValue)
    const { name } = this.getPackageNameAndVersion(trimmedValue)

    if (trimmedValue.length > 1) {
      this.getSuggestions(name)
    }
  }

  getSuggestions = debounce(
    value => {
      fetch(`https://api.npms.io/v2/search/suggestions?q=${value}`)
        .then(result => result.json())
        .then(result => {
          this.setState({
            suggestions: result.sort((packageA, packageB) => {
              if (
                Math.abs(
                  Math.log(packageB.searchScore) -
                  Math.log(packageA.searchScore),
                ) > 1
              ) {
                return packageB.searchScore - packageA.searchScore
              } else {
                return packageB.score.detail.popularity -
                  packageA.score.detail.popularity
              }
            }),
          })
        })
    },
    200,
  )

  handleSubmit = e => {
    if (e) {
      e.preventDefault()
    }

    const startTime = performance.now()
    const packageString = this.state.value.toLowerCase().trim()
    this.setState({ promiseState: 'pending', results: [] })
    console.log(this.state.value)


    ga &&
    ga('send', {
      hitType: 'event',
      eventCategory: 'Search',
      eventAction: 'Perform Search',
      eventLabel: packageString,
    })

    fetch(`/package?name=${packageString}&record=true`)
      .then(result => {
        ga && ga('send', {
          hitType: 'timing',

          timingCategory: 'Response time',
          timingVar: 'fetchTime',
          timingValue: (performance.now() - startTime) / 1000,
        })

        if (result.ok) {
          return result.json()
        } else {
          if (result.status === 503) {
            alert(
              'Uh-oh. This is taking longer than expected. We\'ve queued your request. Check back in a minute?',
            )

            ga &&
            ga('send', {
              hitType: 'event',
              eventCategory: 'Search',
              eventAction: 'Search Failure 503',
              eventLabel: packageString,
            })
          } else if (result.status === 404) {
            alert(`Package '${packageString}' not found.`)

            ga &&
            ga('send', {
              hitType: 'event',
              eventCategory: 'Search',
              eventAction: 'Search Failure 404',
              eventLabel: this.state.value,
            })
          } else {
            alert(
              `Could not create a bundle for the package '${packageString}'. If you're sure this package is meant to be used in a browser, the package may not have a correct entry point and peerDependencies specified.`,
            )

            ga &&
            ga('send', {
              hitType: 'event',
              eventCategory: 'Search',
              eventAction: 'Search Failure Other',
              eventLabel: packageString,
            })
          }

          return Promise.reject(result.json())
        }
      })
      .then(data => {
        ga &&
        ga('send', {
          hitType: 'event',
          eventCategory: 'Search',
          eventAction: 'Search Success',
          eventLabel: packageString,
        })

        this.setState({
          results: data,
          value: `${data.package}@${data.version}`,
          rotation: 0,
        })
      })
      .catch(err => {
        this.setState({
          promiseState: 'rejected',
        })

        console.error(err)
      })
  }

  handleProgressDone = () => {
    this.setState(
      {
        promiseState: 'fulfilled',
      },
      () => {
        setTimeout(
          () => {
            this.setState({
              rotation: Math.min(
                this.state.results.size / 1024 / 100 * 100,
                180,
              ),
            })
          },
          100,
        )
      },
    )
  }

  getPackageNameAndVersion(packageString) {
    // Scoped packages
    let name, version
    const lastAtIndex = packageString.lastIndexOf('@')

    if (packageString.startsWith('@')) {
      if (lastAtIndex === 0) {
        name = packageString
        version = null
      } else {
        name = packageString.substring(0, lastAtIndex)
        version = packageString.substring(lastAtIndex + 1)
      }
    } else {
      if (lastAtIndex === -1) {
        name = packageString
        version = null
      } else {
        name = packageString.substring(0, lastAtIndex)
        version = packageString.substring(lastAtIndex + 1)
      }
    }

    return { name, version }
  }

  handleSearchTagSelect = (name) => {
    ga &&
    ga('send', {
      hitType: 'event',
      eventCategory: 'Search',
      eventAction: 'Search Tag Click',
      eventLabel: name,
    })

    this.setState({ value: name })
    this.handleSubmit()
  }

  render() {
    const { results, suggestions, value, promiseState, rotation } = this.state
    const { name, version } = this.getPackageNameAndVersion(value)

    return (
      <div class={style.home}>
        <section className={style.searchSection}>
          <h1> What is the cost <br /> of my npm package ? </h1>
          <form
            onSubmit={this.handleSubmit}
          >
            <div className={style.searchInputContainer}>
              <AutoComplete
                getItemValue={item => item.package.name}
                inputProps={{
                  placeholder: 'find package',
                  className: style.searchInput,
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }}
                onChange={this.handleInputChange}
                autoHighlight={false}
                ref={s => this.searchInput = s}
                value={value}
                items={suggestions}
                onSelect={(value, item) => {
                  this.setState({ value, suggestions: [item] })
                  this.handleSubmit()
                }}
                renderMenu={
                  (items, value, inbuiltStyles) =>  {
                    return (
                      <div
                        style={{minWidth: inbuiltStyles.minWidth}}
                        className={ style.suggestionsMenu }
                        children={items}
                      />
                    )
                  }
                }
                wrapperStyle={{
                  display: 'inline-block',
                  width: '100%',
                  position: 'relative',
                }}
                renderItem={(item, isHighlighted) => (
                  <div
                    className={cx(style.suggestion, {
                      [style.highlightedSuggestion]: isHighlighted,
                    })}
                  >
                    <div dangerouslySetInnerHTML={{ __html: item.highlight }} />

                    <div className={style.suggestionDescription}>
                      {item.package.description}
                    </div>

                  </div>
                )}
              />
              <div className={style.dummySearchInput}>
              <span className={style.packageName}>
                {name}
              </span>
                {
                  version !== null && (
                    <span className={style.atSeparator}>
                @
              </span>
                  )
                }
                <span className={style.packageVersion}>
                {version}
              </span>
              </div>
            </div>
          </form>

          {
            !promiseState && (
              <SearchTags onSelect={ this.handleSearchTagSelect } />
            )
          }

          {promiseState &&
          promiseState === 'pending' &&
          <ProgressBar
            isDone={!!results.version}
            onDone={this.handleProgressDone}
          />}

        </section>
        {promiseState &&
        promiseState === 'fulfilled' &&
        <section className={style.displaySection}>
          <div className={style.guageContainer}>
            <div className={style.guageMeter}>
              <div className={style.meterFragmentA} />
              <div
                className={style.meterFragmentC}
                style={{
                  transform: `rotate(${rotation}deg)`,
                }}
              />
              <div className={style.meterFragmentB} />
            </div>
            <div className={style.gauge}>
              <img
                className={style.needle}
                src="../../assets/needle.svg"
                alt=""
                style={{
                  transform: `rotate(${rotation - 90}deg)`,
                }}
              />
              <div className={style.circleOuter}>
                <div className={style.circleInner} />
              </div>
            </div>
          </div>

          <ul className={style.panelContainer}>
            <li className={style.panel}>
              <h2 className={style.panelData}>

                {prettyBytes(results.size).split(' ')[0]}

                <span className={style.panelUnit}>
                    {prettyBytes(results.size).split(' ')[1]}
                  </span>

              </h2>

              <h4 className={style.panelLabel}> Minified </h4>

            </li>
            <li className={style.panel}>
              <h2 className={style.panelData}>

                {prettyBytes(results.gzipSize).split(' ')[0]}

                <span className={style.panelUnit}>
                    {prettyBytes(results.gzipSize).split(' ')[1]}
                  </span>

              </h2>

              <h4 className={style.panelLabel}> Minified + Gzipped </h4>

            </li>

            <li className={style.panel}>
              <h2 className={style.panelData}>

                {(results.gzipSize / (250 * 1024 / 8)).toFixed(2)}

                <span className={style.panelUnit}> s </span>

              </h2>

              <h4 className={style.panelLabel}>
                Download Over 2G
              </h4>
            </li>
            <li className={style.panel}>
              <h2 className={style.panelData}>

                {(results.gzipSize / (400 * 1024 / 8)).toFixed(2)}

                <span className={style.panelUnit}> s </span>

              </h2>

              <h4 className={style.panelLabel}>
                Download Over 3G
              </h4>
            </li>

            <li className={style.panel}>
              <h2 className={style.panelData}> {results.dependencies} </h2>

              <h4 className={style.panelLabel}>
                Dependencies
              </h4>
            </li>
          </ul>
        </section>}
      </div>
    )
  }
}
