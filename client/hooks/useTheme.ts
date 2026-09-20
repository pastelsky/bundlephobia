import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function parseTheme(value: string | null): Theme | null {
  return value === 'dark' || value === 'light' ? value : null
}

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Server-side: default to light (FOUC script in _document handles the
    // actual pre-hydration value on the client).
    return 'light'
  })

  const apply = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setTheme(next)
  }, [])

  useEffect(() => {
    // Read the value already applied by the FOUC script
    const applied = parseTheme(
      document.documentElement.getAttribute('data-theme'),
    )

    if (applied === 'dark' || applied === 'light') {
      setTheme(applied)

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
