import React from 'react'
import cx from 'classnames'
import { useCombobox } from 'downshift'

import SearchIcon from '../Icons/SearchIcon'
import { parsePackageString } from '../../../utils/common.utils'
import type { PackageSuggestion } from '../../api'
import { useAutocompleteInput } from './hooks/useAutocompleteInput'
import { SuggestionItem } from './components/SuggestionItem'
import { useFontSize } from './hooks/useFontSize'
import { IconButton } from '../ui'

type AutocompleteInputProps = {
  initialValue?: string
  renderAsH1?: boolean
  className?: string
  containerClass?: string
  autoFocus?: boolean
  ariaLabel?: string
  compact?: boolean
  loadSuggestions?: (query: string) => Promise<PackageSuggestion[]>
  onSearchSubmit: (value: string) => void
}

export const AutocompleteInput = ({
  initialValue = '',
  renderAsH1 = false,
  className,
  containerClass,
  autoFocus,
  ariaLabel = 'Package name',
  compact = false,
  loadSuggestions,
  onSearchSubmit,
}: AutocompleteInputProps) => {
  const {
    value,
    suggestions,
    handleSubmit,
    handleInputValueChange,
    setSuggestions,
  } = useAutocompleteInput({
    initialValue,
    onSubmit: onSearchSubmit,
    loadSuggestions,
  })
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
    [value],
  )

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key !== 'Enter' ||
      event.nativeEvent.isComposing ||
      highlightedIndex >= 0 ||
      !value.trim()
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onSearchSubmit(value)
  }

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
              'aria-label': ariaLabel,
              className: cx('autocomplete-input', {
                'autocomplete-input--compact': compact,
              }),
              autoCorrect: 'off',
              autoFocus,
              autoCapitalize: 'off',
              spellCheck: false,
              style: compact ? undefined : { fontSize: searchFontSize! },
              onKeyDown: handleInputKeyDown,
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
          style={compact ? undefined : { fontSize: searchFontSize! }}
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
      <IconButton
        type="submit"
        className="autocomplete-input__search-icon"
        label="Search package"
        variant="quiet"
      >
        <SearchIcon className="" />
      </IconButton>
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
