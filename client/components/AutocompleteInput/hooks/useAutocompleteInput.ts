import React from 'react'
import debounce from 'debounce'

import { parsePackageString } from '../../../../utils/common.utils'
import API, { type PackageSuggestion } from '../../../api'

interface UseAutocompleteInputArgs {
  initialValue: string
  onSubmit: (value: string) => void
  loadSuggestions?: (query: string) => Promise<PackageSuggestion[]>
}

export function useAutocompleteInput({
  initialValue,
  onSubmit,
  loadSuggestions = API.getSuggestions,
}: UseAutocompleteInputArgs) {
  const [value, setValue] = React.useState(initialValue)
  const [suggestions, setSuggestions] = React.useState<PackageSuggestion[]>([])
  const [, startTransition] = React.useTransition()
  const typedValueRef = React.useRef(initialValue)

  React.useEffect(() => {
    setValue(initialValue)
    typedValueRef.current = initialValue
  }, [initialValue])

  const getSuggestions = React.useMemo(() => {
    return debounce((query: string) => {
      loadSuggestions(query).then(nextSuggestions => {
        startTransition(() => {
          setSuggestions(nextSuggestions)
        })
      })
    }, 150)
  }, [loadSuggestions, startTransition])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!value.trim()) return

    onSubmit(value)
  }

  const handleInputValueChange = (nextValue: string) => {
    setValue(nextValue)
    typedValueRef.current = nextValue
    const trimmedValue = nextValue.trim()
    const { name } = parsePackageString(trimmedValue)

    if (trimmedValue.length > 1) {
      getSuggestions(name)
    }

    if (!trimmedValue) {
      setSuggestions([])
    }
  }

  const setDisplayValue = React.useCallback((nextValue: string) => {
    setValue(nextValue)
  }, [])

  const restoreTypedValue = React.useCallback(() => {
    setValue(typedValueRef.current)
  }, [])

  const resetToInitial = React.useCallback(() => {
    setValue(initialValue)
    typedValueRef.current = initialValue
    setSuggestions([])
  }, [initialValue])

  return {
    value,
    suggestions,
    handleSubmit,
    handleInputValueChange,
    setDisplayValue,
    restoreTypedValue,
    resetToInitial,
    setSuggestions,
  }
}
