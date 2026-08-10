import React from 'react'
import Head from 'next/head'
import { AppProps } from 'next/app'
import '../stylesheets/index.scss'
import { initializeAmplitude } from '../client/amplitude'

function App({ Component, pageProps }: AppProps) {
  React.useEffect(() => {
    initializeAmplitude()
  }, [])

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title key="title">Bundlephobia ❘ cost of adding a npm package</title>
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default App
