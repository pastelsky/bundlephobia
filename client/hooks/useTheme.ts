import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Server-side: default to light (FOUC script in _document handles the
    // actual pre-hydration value on the client).
    return 'light'
  })

  useEffect(() => {
    // Read the value already applied by the FOUC script
    const applied = document.documentElement.getAttribute(
      'data-theme'
    ) as Theme | null
    if (applied === 'dark' || applied === 'light') {
      setTheme(applied)
      return
    }
    // Fallback: no FOUC script result
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'dark' || stored === 'light') {
      apply(stored)
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      apply('dark')
    }
  }, [])

  const apply = (next: Theme) => {
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setTheme(next)
  }

  const toggleTheme = () => apply(theme === 'light' ? 'dark' : 'light')

  return { theme, toggleTheme }
}
