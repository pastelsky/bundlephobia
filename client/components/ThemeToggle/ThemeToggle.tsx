import React from 'react'
import { useTheme } from '../../hooks/useTheme'

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label="Toggle Dark Mode"
      style={{
        background: 'transparent',
        border: '1px solid var(--color-raven)',
        color: 'var(--color-dark-gulf-blue)',
        padding: '5px 10px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.8rem',
        marginLeft: '10px',
      }}
    >
      {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
    </button>
  )
}

export default ThemeToggle
