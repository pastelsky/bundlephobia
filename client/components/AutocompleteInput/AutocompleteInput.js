import React, { PureComponent } from 'react'
import AutoComplete from 'react-autocomplete'
import cx from 'classnames'
import stylesheet from './AutocompleteInput.scss'

import fetch from 'unfetch'
import debounce from 'debounce'

import { parsePackageString } from 'utils/index'

export default class AutocompleteInput extends PureComponent {

  static defaultProps = {
    initialValue: '',
  }

  state = {
    value: this.props.initialValue,
    suggestions: [],
  }

  suggestionComparator(packageA, packageB) {
    // Rank closely matching packages followed
    // by most popular ones
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
  }

  getSuggestions = debounce(
    value => {
      fetch(`https://api.npms.io/v2/search/suggestions?q=${value}`)
        .then(result => result.json())
        .then(result => {
          this.setState({
            suggestions: result.sort(this.suggestionComparator),
          })
        })
    },
    200,
  )

  renderSuggestionItem = (item, isHighlighted) => (
    <div
      className={ cx('autocomplete-input__suggestion', {
        'autocomplete-input__suggestion--highlight': isHighlighted,
      }) }
    >
      <div dangerouslySetInnerHTML={ { __html: item.highlight } } />

      <div className="autocomplete-input__suggestion-description">
        { item.package.description }
      </div>
    </div>
  )

  handleSubmit = (e, e2, value) => {
    const { onSearchSubmit } = this.props

    if (e) {
      e.preventDefault();
    }

    onSearchSubmit(value || this.state.value)
  }

  handleInputChange = ({ target }) => {
    this.setState({ value: target.value })
    const trimmedValue = target.value.trim()
    const { name } = parsePackageString(trimmedValue)

    if (trimmedValue.length > 1) {
      this.getSuggestions(name)
    }
  }

  render() {
    const { className, containerClass } = this.props
    const { suggestions, value } = this.state
    const { name, version } = parsePackageString(value)
    const baseFontSize = (typeof window !== 'undefined'  && window.innerWidth < 640) ? 22 : 35
    const maxFullSizeChars = (typeof window !== 'undefined'  && window.innerWidth < 640) ? 15 : 20
    const searchFontSize = value.length < maxFullSizeChars ? null :
      `${baseFontSize - (value.length - maxFullSizeChars) * 0.8}px`

    return (
      <form
        className={ cx(containerClass, "autocomplete-input__form") }
        onSubmit={ this.handleSubmit }
      >
        <style dangerouslySetInnerHTML={ { __html: stylesheet } } />
        <div className={ cx("autocomplete-input__container", className) }>
          <AutoComplete
            getItemValue={ item => item.package.name }
            inputProps={ {
              placeholder: 'find package',
              className: 'autocomplete-input',
              autoCorrect: 'off',
              autoCapitalize: 'off',
              spellCheck: false,
              style: { fontSize: searchFontSize },
            } }
            onChange={ this.handleInputChange }
            autoHighlight={ false }
            ref={ s => this.searchInput = s }
            value={ value }
            items={ suggestions }
            onSelect={ (value, item) => {
              this.setState({ value, suggestions: [item] })
              this.handleSubmit(null, null, value)
            } }
            renderMenu={
              (items, value, inbuiltStyles) => {
                return (
                  <div
                    style={ { minWidth: inbuiltStyles.minWidth } }
                    className="autocomplete-input__suggestions-menu"
                    children={ items }
                  />
                )
              }
            }
            wrapperStyle={ {
              display: 'inline-block',
              width: '100%',
              position: 'relative',
            } }
            renderItem={ this.renderSuggestionItem }
          />
          <div
            style={ { fontSize: searchFontSize } }
            className="autocomplete-input__dummy-input"
          >
      <span className="dummy-input__package-name">
       { name }
      </span>
            {
              version !== null && (
                <span className="dummy-input__at-separator">
          @
        </span>
              )
            }
            <span className="dummy-input__package-version">
        { version }
      </span>
          </div>
        </div>
        <div className="autocomplete-input__search-icon"
             onClick={ this.handleSubmit }>
          <svg
            width="90"
            height="90"
            viewBox="0 0 90 90"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M89.32 86.5L64.25 61.4C77.2 47 76.75 24.72 62.87 10.87 55.93 3.92 46.7.1 36.87.1s-19.06 3.82-26 10.77C3.92 17.8.1 27.05.1 36.87s3.82 19.06 10.77 26c6.94 6.95 16.18 10.77 26 10.77 9.15 0 17.8-3.32 24.55-9.4l25.08 25.1c.38.4.9.57 1.4.57.52 0 1.03-.2 1.42-.56.78-.78.78-2.05 0-2.83zM36.87 69.63c-8.75 0-16.98-3.4-23.17-9.6-6.2-6.2-9.6-14.42-9.6-23.17 0-8.75 3.4-16.98 9.6-23.17 6.2-6.2 14.42-9.6 23.17-9.6 8.75 0 16.98 3.4 23.18 9.6 12.77 12.75 12.77 33.55 0 46.33-6.2 6.2-14.43 9.6-23.18 9.6z" />
          </svg>
        </div>
      </form>
    )
  }
}