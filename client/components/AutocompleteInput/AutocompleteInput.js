import React, { PureComponent } from 'react'
import debounce from 'debounce'
import AutoComplete from 'react-autocomplete'
import cx from 'classnames'

import SearchIcon from '../Icons/SearchIcon'
import { parsePackageString } from 'utils/common.utils'
import API from 'client/api'

import './AutocompleteInput.scss'

export default class AutocompleteInput extends PureComponent {
  static defaultProps = {
    initialValue: '',
  }

  state = {
    value: this.props.initialValue,
    suggestions: [],
    isMenuVisible: false,
  }

  getSuggestions = debounce(value => {
    API.getSuggestions(value).then(result => {
      this.setState({ suggestions: result })
    })
  }, 150)

  renderSuggestionItem = (item, isHighlighted) => (
    <div
      className={cx('autocomplete-input__suggestion', {
        'autocomplete-input__suggestion--highlight': isHighlighted,
      })}
    >
      <div dangerouslySetInnerHTML={{ __html: item.highlight }} />

      <div className="autocomplete-input__suggestion-description">
        {item.package.description}
      </div>
    </div>
  )

  handleSubmit = (e, e2, value) => {
    const { onSearchSubmit } = this.props

    if (e) {
      e.preventDefault()
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

  handleMenuVisibilityChange = isOpen => {
    this.setState({ isMenuVisible: isOpen })
  }

  render() {
    const { className, containerClass, autoFocus } = this.props
    const { suggestions, value, isMenuVisible } = this.state
    const { name, version } = parsePackageString(value)
    const baseFontSize =
      typeof window !== 'undefined' && window.innerWidth < 640 ? 22 : 35
    const maxFullSizeChars =
      typeof window !== 'undefined' && window.innerWidth < 640 ? 15 : 20
    const searchFontSize =
      value.length < maxFullSizeChars
        ? null
        : `${baseFontSize - (value.length - maxFullSizeChars) * 0.8}px`

    return (
      <form
        className={cx(containerClass, 'autocomplete-input__form')}
        onSubmit={this.handleSubmit}
      >
        <div
          className={cx('autocomplete-input__container', className, {
            'autocomplete-input__container--menu-visible':
              isMenuVisible && !!suggestions.length,
          })}
        >
          <AutoComplete
            getItemValue={item => item.package.name}
            inputProps={{
              placeholder: 'find package',
              className: 'autocomplete-input',
              autoCorrect: 'off',
              autoFocus: autoFocus,
              autoCapitalize: 'off',
              spellCheck: false,
              style: { fontSize: searchFontSize },
            }}
            onMenuVisibilityChange={this.handleMenuVisibilityChange}
            onChange={this.handleInputChange}
            ref={s => (this.searchInput = s)}
            value={value}
            items={suggestions}
            onSelect={(value, item) => {
              this.setState({ value, suggestions: [item] })
              this.handleSubmit(null, null, value)
            }}
            renderMenu={(items, value, inbuiltStyles) => {
              return (
                <div
                  style={{ minWidth: inbuiltStyles.minWidth }}
                  className="autocomplete-input__suggestions-menu"
                  children={items}
                />
              )
            }}
            wrapperStyle={{
              display: 'inline-block',
              width: '100%',
              position: 'relative',
            }}
            renderItem={this.renderSuggestionItem}
          />
          <div
            style={{ fontSize: searchFontSize }}
            className="autocomplete-input__dummy-input"
          >
            <span className="dummy-input__package-name">{name}</span>
            {version !== null && (
              <span className="dummy-input__at-separator">@</span>
            )}
            <span className="dummy-input__package-version">{version}</span>
          </div>
        </div>
        <div
          className="autocomplete-input__search-icon"
          onClick={this.handleSubmit}
        >
          <SearchIcon />
        </div>
      </form>
    )
  }
}
