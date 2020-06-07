import React from 'react'
import App from 'next/app'

import ThemeContextProvider from 'client/components/ThemeContext'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    return (
      <ThemeContextProvider>
        <Component {...pageProps} />
      </ThemeContextProvider>
    )
  }
}

export default MyApp
