import React from 'react'
import Head from 'next/head'
import { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import '../stylesheets/index.scss'
import { initializeAmplitude } from '../client/amplitude'
import Analytics from '../client/analytics'

function App({ Component, pageProps }: AppProps) {
  const { events } = useRouter()

  React.useEffect(() => {
    initializeAmplitude()
    Analytics.pageView()

    let pathname = window.location.pathname

    const onRouteComplete = () => {
      const nextPathname = window.location.pathname

      if (nextPathname === pathname) return

      pathname = nextPathname
      Analytics.pageView()
    }

    events.on('routeChangeComplete', onRouteComplete)

    return () => events.off('routeChangeComplete', onRouteComplete)
  }, [events])

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
