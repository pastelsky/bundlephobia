import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

function parseTheme(value: string | null): Theme | null {
  return value === 'dark' || value === 'light' ? value : null
}

export const useTheme = () => {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener('themechange', onStoreChange)

    return () => window.removeEventListener('themechange', onStoreChange)
  }, [])

  const getSnapshot = useCallback(
    () =>
      parseTheme(document.documentElement.getAttribute('data-theme')) ??
      'light',
    [],
  )

  const getServerSnapshot = useCallback((): Theme => 'light', [])

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const apply = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    window.dispatchEvent(new Event('themechange'))
  }, [])

  useEffect(() => {
    // Read the value already applied by the FOUC script
    const applied = parseTheme(
      document.documentElement.getAttribute('data-theme'),
    )

    if (applied === 'dark' || applied === 'light') {
      return
    }

    // Fallback: no FOUC script result
    const stored = parseTheme(localStorage.getItem('theme'))

    if (stored === 'dark' || stored === 'light') {
      apply(stored)
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      apply('dark')
    }
  }, [apply])

  const toggleTheme = () => apply(theme === 'light' ? 'dark' : 'light')

  return { theme, toggleTheme }
}
