import React from 'react'
import cx from 'classnames'
import AutoComplete from 'react-autocomplete'

import SearchIcon from '../Icons/SearchIcon'
import { parsePackageString } from '../../../utils/common.utils'
import { useAutocompleteInput } from './hooks/useAutocompleteInput'
import { SuggestionItem } from './components/SuggestionItem'
import { useFontSize } from './hooks/useFontSize'

type AutocompleteInputProps = {
  initialValue?: string
  renderAsH1?: boolean
  className?: string
  containerClass?: string
  autoFocus?: boolean
  compact?: boolean
  suggestionQueries?: string[]
  onSearchSubmit: (value: string) => void
}

export const AutocompleteInput = ({
  initialValue = '',
  renderAsH1 = false,
  className,
  containerClass,
  autoFocus,
  compact = false,
  suggestionQueries,
  onSearchSubmit,
}: AutocompleteInputProps) => {
  const searchInput = React.useRef<AutoComplete | null>(null)
  const {
    value,
    isMenuVisible,
    suggestions,
    handleSubmit,
    handleInputChange,
    setIsMenuVisible,
    setSuggestions,
  } = useAutocompleteInput({
    initialValue,
    onSubmit: onSearchSubmit,
    suggestionQueries,
  })
  const { searchFontSize } = useFontSize({ value })

  const { name, version } = React.useMemo(
    () => parsePackageString(value),
    [value]
  )

  return (
    <form
      className={cx(containerClass, 'autocomplete-input__form', {
        'autocomplete-input__form--compact': compact,
      })}
      onSubmit={handleSubmit}
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
            className: cx('autocomplete-input', {
              'autocomplete-input--compact': compact,
            }),
            autoCorrect: 'off',
            autoFocus: autoFocus,
            autoCapitalize: 'off',
            spellCheck: false,
            style: compact ? undefined : { fontSize: searchFontSize! },
          }}
          onMenuVisibilityChange={isOpen => setIsMenuVisible(isOpen)}
          onChange={handleInputChange}
          ref={searchInput}
          value={value}
          items={suggestions}
          onSelect={(value, item) => {
            setSuggestions([item])
            onSearchSubmit(value)
          }}
          renderMenu={(items, value, inbuiltStyles) => {
            return (
              <div
                style={
                  compact ? undefined : { minWidth: inbuiltStyles.minWidth }
                }
                className="autocomplete-input__suggestions-menu"
              >
                {items as any}
              </div>
            )
          }}
          wrapperStyle={{
            display: 'inline-block',
            width: '100%',
            position: 'relative',
          }}
          renderItem={(item, isHighlighted) => (
            <div key={item.package.name}>
              <SuggestionItem item={item} isHighlighted={isHighlighted} />
            </div>
          )}
        />
        <div
          style={{ fontSize: searchFontSize! }}
          className={cx('autocomplete-input__dummy-input', {
            'autocomplete-input__dummy-input--compact': compact,
          })}
        >
          <PackageNameElement
            isHeading={renderAsH1}
            className="dummy-input__package-name"
          >
            {name}
          </PackageNameElement>
          {version !== null && (
            <>
              <span className="dummy-input__at-separator">@</span>
              <span className="dummy-input__package-version">{version}</span>
            </>
          )}
        </div>
      </div>
      <button type="submit" className="autocomplete-input__search-icon">
        <SearchIcon className="" />
      </button>
    </form>
  )
}

type PackageNameElementProps = React.HTMLAttributes<HTMLElement> & {
  isHeading?: boolean
}

export function PackageNameElement({
  isHeading,
  ...props
}: PackageNameElementProps) {
  return isHeading ? <h1 {...props} /> : <span {...props} />
}
