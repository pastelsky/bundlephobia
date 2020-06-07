import React, { useContext, useCallback } from 'react'
import cx from 'classnames'
import { Themes, ThemeContext } from 'client/components/ThemeContext'
import SunIcon from '../../assets/sun.svg'
import MoonIcon from '../../assets/moon.svg'

import './ThemeToggle.scss'

const ThemeToggle = ({ className }) => {
  const { theme, toggleTheme } = useContext(ThemeContext)
  const onToggleTheme = useCallback(() => {
    if (theme === Themes.dark) {
      document.body.classList.remove('dark-theme')
    } else {
      document.body.classList.add('dark-theme')
    }

    toggleTheme()
  })

  return (
    <button className={cx('theme-toggle', className)} onClick={onToggleTheme}>
      {theme === Themes.dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

export default ThemeToggle
