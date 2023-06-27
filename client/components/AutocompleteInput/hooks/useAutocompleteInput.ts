import React from 'react'
import debounce from 'just-debounce-it'

import { parsePackageString } from '../../../../utils/common.utils'
import API from '../../../api'

interface UseAutocompleteInputArgs {
  initialValue: string
  onSubmit: (value: string) => void
}

export function useAutocompleteInput({
  initialValue,
  onSubmit,
}: UseAutocompleteInputArgs) {
  const [value, setValue] = React.useState(initialValue)
  const [suggestions, setSuggestions] = React.useState<any[]>([])
  const [isMenuVisible, setIsMenuVisible] = React.useState(false)

  const getSuggestions = React.useMemo(
    () =>
      debounce((value: string) => {
        API.getSuggestions(value).then(result => {
          setSuggestions(result)
        })
      }, 150),
    []
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(value)
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    value: string
  ) => {
    setValue(e.target.value)
    const trimmedValue = e.target.value.trim()
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
    isMenuVisible,
    handleSubmit,
    handleInputChange,
    setIsMenuVisible,
    setSuggestions,
  }
}
