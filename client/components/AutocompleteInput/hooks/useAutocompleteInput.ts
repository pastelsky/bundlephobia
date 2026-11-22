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
  const suggestionRequest = React.useRef(0)
  const typedValueRef = React.useRef(initialValue)

  React.useEffect(() => {
    setValue(initialValue)
    typedValueRef.current = initialValue
    suggestionRequest.current += 1
  }, [initialValue])

  const getSuggestions = React.useMemo(() => {
    return debounce((query: string, requestId: number) => {
      if (suggestionRequest.current !== requestId) return

      const publish = (nextSuggestions: PackageSuggestion[]) => {
        if (suggestionRequest.current !== requestId) return

        React.startTransition(() => setSuggestions(nextSuggestions))
      }

      void loadSuggestions(query).then(publish, () => publish([]))
    }, 150)
  }, [loadSuggestions])

  React.useEffect(
    () => () => {
      suggestionRequest.current += 1
      getSuggestions.clear()
    },
    [getSuggestions],
  )

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
    const requestId = ++suggestionRequest.current

    if (trimmedValue.length > 1 && name) {
      getSuggestions(name, requestId)
    } else {
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
    suggestionRequest.current += 1
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
