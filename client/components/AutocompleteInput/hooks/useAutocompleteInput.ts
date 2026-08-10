import React from 'react'
import debounce from 'debounce'

import { parsePackageString } from '../../../../utils/common.utils'
import API, { type PackageSuggestion } from '../../../api'

const EMPTY_SUGGESTION_QUERIES: string[] = []

interface UseAutocompleteInputArgs {
  initialValue: string
  onSubmit: (value: string) => void
  suggestionQueries?: string[]
}

export function useAutocompleteInput({
  initialValue,
  onSubmit,
  suggestionQueries = EMPTY_SUGGESTION_QUERIES,
}: UseAutocompleteInputArgs) {
  const [value, setValue] = React.useState(initialValue)
  const [suggestions, setSuggestions] = React.useState<PackageSuggestion[]>([])
  const [, startTransition] = React.useTransition()

  const getSuggestions = React.useMemo(() => {
    const queries = suggestionQueries.filter(Boolean).slice(0, 5)

    return debounce((value: string) => {
      const requests = [value, ...queries].map(query =>
        API.getSuggestions(query)
      )

      Promise.allSettled(requests).then(results => {
        const merged = new Map<string, PackageSuggestion>()
        results.forEach(result => {
          if (result.status !== 'fulfilled') return
          result.value.forEach(item => {
            if (!merged.has(item.package.name)) {
              merged.set(item.package.name, item)
            }
          })
        })

        const normalizedValue = value.toLowerCase()
        startTransition(() => {
          setSuggestions(
            Array.from(merged.values())
              .filter(item =>
                item.package.name.toLowerCase().includes(normalizedValue)
              )
              .sort((a, b) => {
                const aPrefix = a.package.name
                  .toLowerCase()
                  .startsWith(normalizedValue)
                const bPrefix = b.package.name
                  .toLowerCase()
                  .startsWith(normalizedValue)
                if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
                return b.score.detail.popularity - a.score.detail.popularity
              })
          )
        })
      })
    }, 150)
  }, [startTransition, suggestionQueries])

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
