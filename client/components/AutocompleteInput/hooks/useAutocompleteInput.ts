import React from 'react'
import debounce from 'debounce'

import { parsePackageString } from '../../../../utils/common.utils'
import API, { type PackageSuggestion } from '../../../api'

interface UseAutocompleteInputArgs {
  initialValue: string
  onSubmit: (value: string) => void
}

export function useAutocompleteInput({
  initialValue,
  onSubmit,
}: UseAutocompleteInputArgs) {
  const [value, setValue] = React.useState(initialValue)
  const [suggestions, setSuggestions] = React.useState<PackageSuggestion[]>([])
  const [, startTransition] = React.useTransition()

  const getSuggestions = React.useMemo(
    () =>
      debounce((value: string) => {
        API.getSuggestions(value).then(result => {
          startTransition(() => setSuggestions(result))
        })
      }, 150),
    [startTransition]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(value)
  }

  const handleInputValueChange = (nextValue: string) => {
    setValue(nextValue)
    const trimmedValue = nextValue.trim()
    const { name } = parsePackageString(trimmedValue)

    if (trimmedValue.length > 1) {
      getSuggestions(name)
    }

    if (!trimmedValue) {
      setSuggestions([])
    }
  }

  return {
    value,
    suggestions,
    handleSubmit,
    handleInputValueChange,
    setSuggestions,
  }
}
