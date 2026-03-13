import React from 'react'
import debounce from 'debounce'

import { parsePackageString, isEmpty } from '../../../../utils/common.utils'
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
  const [isValidationError, setIsValidationError] = React.useState(false)

  const getSuggestions = React.useMemo(
    () =>
      debounce((value: string) => {
        API.getSuggestions(value).then(result => {
          setSuggestions(result)
        })
      }, 150),
    []
  )

  const errorClearHandler = () => {
    setIsValidationError(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEmpty(value)) {
      onSubmit(value)
    } else {
      setIsValidationError(true)
    }
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
    isValidationError,
    errorClearHandler,
  }
}
