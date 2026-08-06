import React from 'react'
import cx from 'classnames'
import { useCombobox } from 'downshift'

import SearchIcon from '../Icons/SearchIcon'
import { PotatoRain } from '../PotatoRain'
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
  onSearchSubmit: (value: string) => void
}

export const AutocompleteInput = ({
  initialValue = '',
  renderAsH1 = false,
  className,
  containerClass,
  autoFocus,
  onSearchSubmit,
}: AutocompleteInputProps) => {
  const {
    value,
    suggestions,
    potatoRainId,
    handleSubmit,
    handleKeyDown,
    handleInputValueChange,
    setSuggestions,
    stopPotatoRain,
  } = useAutocompleteInput({ initialValue, onSubmit: onSearchSubmit })
  const { searchFontSize } = useFontSize({ value })

  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getItemProps,
    getMenuProps,
  } = useCombobox({
    items: suggestions,
    inputValue: value,
    itemToString: item => item?.package.name ?? '',
    onInputValueChange: ({ inputValue = '' }) => {
      handleInputValueChange(inputValue)
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return

      setSuggestions([selectedItem])
      onSearchSubmit(selectedItem.package.name)
    },
  })

  const { name, version } = React.useMemo(
    () => parsePackageString(value),
    [value]
  )

  return (
    <form
      className={cx(containerClass, 'autocomplete-input__form')}
      onSubmit={handleSubmit}
    >
      <div
        className={cx('autocomplete-input__container', className, {
          'autocomplete-input__container--menu-visible':
            isOpen && !!suggestions.length,
        })}
      >
        <div
          style={{
            display: 'inline-block',
            width: '100%',
            position: 'relative',
          }}
        >
          <input
            {...getInputProps({
              placeholder: 'find package',
              className: 'autocomplete-input',
              autoCorrect: 'off',
              autoFocus,
              autoCapitalize: 'off',
              spellCheck: false,
              style: { fontSize: searchFontSize! },
              onKeyDown: handleKeyDown,
            })}
          />
          <div
            {...getMenuProps()}
            className="autocomplete-input__suggestions-menu"
          >
            {isOpen &&
              suggestions.map((item, index) => (
                <SuggestionItem
                  {...getItemProps({ item, index })}
                  key={item.package.name}
                  item={item}
                  isHighlighted={highlightedIndex === index}
                />
              ))}
          </div>
        </div>
        <div
          style={{ fontSize: searchFontSize! }}
          className="autocomplete-input__dummy-input"
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
      <button
        type="submit"
        className="autocomplete-input__search-icon"
        aria-label="Search package"
      >
        <SearchIcon className="" />
      </button>
      {potatoRainId !== null && (
        <PotatoRain key={potatoRainId} onComplete={stopPotatoRain} />
      )}
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
