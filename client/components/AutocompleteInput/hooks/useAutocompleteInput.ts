import React from 'react'
import debounce from 'debounce'

import { parsePackageString } from '../../../../utils/common.utils'
import API, { type PackageSuggestion } from '../../../api'
import { isPotatoQuery } from '../../PotatoRain'

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
  const [potatoRainId, setPotatoRainId] = React.useState<number | null>(null)
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

  const stopPotatoRain = React.useCallback(() => setPotatoRainId(null), [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isPotatoQuery(value)) {
      setSuggestions([])
      setPotatoRainId(id => (id ?? 0) + 1)
      return
    }

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
    potatoRainId,
    handleSubmit,
    handleInputValueChange,
    setSuggestions,
    stopPotatoRain,
  }
}
