import React from 'react'
import cx from 'classnames'
import { useCombobox, type UseComboboxReturnValue } from 'downshift'

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

function submitOnEnter(
  event: React.KeyboardEvent<HTMLInputElement>,
  options: {
    highlightedIndex: number
    value: string
    onSearchSubmit: (value: string) => void
  },
) {
  const { highlightedIndex, value, onSearchSubmit } = options
  const shouldSubmit =
    event.key === 'Enter' &&
    !event.nativeEvent.isComposing &&
    highlightedIndex < 0 &&
    Boolean(value.trim())
  if (!shouldSubmit) return

  event.preventDefault()
  event.stopPropagation()
  onSearchSubmit(value)
}

function useAutocompleteCombobox({
  suggestions,
  value,
  handleInputValueChange,
  setSuggestions,
  onSearchSubmit,
}: {
  suggestions: PackageSuggestion[]
  value: string
  handleInputValueChange: (value: string) => void
  setSuggestions: (suggestions: PackageSuggestion[]) => void
  onSearchSubmit: (value: string) => void
}) {
  return useCombobox({
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
}

function SuggestionMenu({
  isOpen,
  suggestions,
  highlightedIndex,
  getItemProps,
  getMenuProps,
}: {
  isOpen: boolean
  suggestions: PackageSuggestion[]
  highlightedIndex: number
  getItemProps: UseComboboxReturnValue<PackageSuggestion>['getItemProps']
  getMenuProps: UseComboboxReturnValue<PackageSuggestion>['getMenuProps']
}) {
  return (
    <div {...getMenuProps()} className="autocomplete-input__suggestions-menu">
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
  )
}

function DummyInput({
  compact,
  searchFontSize,
  renderAsH1,
  name,
  version,
}: {
  compact: boolean
  searchFontSize: React.CSSProperties['fontSize']
  renderAsH1: boolean
  name: string
  version: string | null
}) {
  return (
    <div
      style={compact ? undefined : { fontSize: searchFontSize }}
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
  )
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
  } = useAutocompleteCombobox({
    suggestions,
    value,
    handleInputValueChange,
    setSuggestions,
    onSearchSubmit,
  })

  const { name, version } = React.useMemo(
    () => parsePackageString(value),
    [value],
  )

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    submitOnEnter(event, { highlightedIndex, value, onSearchSubmit })
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
          <SuggestionMenu
            isOpen={isOpen}
            suggestions={suggestions}
            highlightedIndex={highlightedIndex}
            getItemProps={getItemProps}
            getMenuProps={getMenuProps}
          />
        </div>
        <DummyInput
          compact={compact}
          searchFontSize={searchFontSize!}
          renderAsH1={renderAsH1}
          name={name}
          version={version}
        />
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
