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

  const startPotatoRain = () => {
    setSuggestions([])
    setPotatoRainId(id => (id ?? 0) + 1)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isPotatoQuery(value)) {
      startPotatoRain()
      return
    }

    onSubmit(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !isPotatoQuery(value)) return

    // downshift swallows Enter while the suggestions menu is open, so the
    // easter egg has to claim the keypress before the form is submitted
    e.preventDefault()
    ;(
      e.nativeEvent as KeyboardEvent & { preventDownshiftDefault?: boolean }
    ).preventDownshiftDefault = true
    startPotatoRain()
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
    handleKeyDown,
    handleInputValueChange,
    setSuggestions,
    stopPotatoRain,
  }
}
