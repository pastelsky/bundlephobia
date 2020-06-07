import React, { createContext, useState } from 'react'

export const Themes = {
  light: 'light',
  dark: 'dark',
}

export const ThemeContext = createContext({
  theme: Themes.light,
  toggleTheme: () => {},
})

const ThemeContextProvider = props => {
  const [theme, setTheme] = useState(Themes.light)
  const toggleTheme = () => {
    setTheme(theme === Themes.light ? Themes.dark : Themes.light)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {props.children}
    </ThemeContext.Provider>
  )
}
export default ThemeContextProvider
