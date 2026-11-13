import React from 'react'
import Head from 'next/head'
import { AppProps } from 'next/app'
import { Source_Code_Pro } from 'next/font/google'
import { useRouter } from 'next/router'
import '../stylesheets/index.scss'
import { initializeAmplitude } from '../client/amplitude'
import Analytics from '../client/analytics'

const codeFont = Source_Code_Pro({
  weight: 'variable',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

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
      <style jsx global>{`
        :root {
          --font-family-code: ${codeFont.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}

export default App
