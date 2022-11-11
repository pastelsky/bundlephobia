import React from 'react'

export function useFontSize({ value }: { value: string }) {
  const searchFontSize = React.useMemo(() => {
    const baseFontSize =
      typeof window !== 'undefined' && window.innerWidth < 640 ? 22 : 35
    const maxFullSizeChars =
      typeof window !== 'undefined' && window.innerWidth < 640 ? 15 : 20
    const searchFontSize =
      value.length < maxFullSizeChars
        ? null
        : `${baseFontSize - (value.length - maxFullSizeChars) * 0.8}px`

    return searchFontSize
  }, [value])

  return { searchFontSize }
}
