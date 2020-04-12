import React from 'react'
import Document, { Head as DocumentHead, Main, NextScript } from 'next/document'
import Head from 'next/head'

export default class MyDocument extends Document {
  static getInitialProps({ renderPage }) {
    const { html, head, chunks } = renderPage()
    return { html, head, chunks }
  }

  render() {
    return (
      <html>
        <Head>
          <meta charSet="utf-8" />
          <meta httpEquiv="x-ua-compatible" content="ie=edge" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, shrink-to-fit=no"
          />
          <title key="title">BundlePhobia ❘ cost of adding a npm package</title>
          <meta name="application-name" content="BundlePhobia" />
          <meta
            name="description"
            content="Bundlephobia helps you find the performance impact of adding a npm package to your front-end bundle"
          />
          <link rel="canonical" href="https://bundlephobia.com" />
          <link
            href="https://fonts.googleapis.com/css?family=Source+Code+Pro:300,400,600"
            rel="stylesheet"
          />
          <link
            rel="search"
            type="application/opensearchdescription+xml"
            href="/open-search-description.xml"
            title="bundlephobia"
          />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon-32x32.png?l=4"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon-16x16.png?l=3"
          />
          <link rel="manifest" href="/manifest.json" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
          <meta name="apple-mobile-web-app-title" content="BundlePhobia" />
          <meta name="application-name" content="BundlePhobia" />
          <meta name="theme-color" content="#212121" />

          <meta property="og:title" key="og:title" content="BundlePhobia" />
          <meta
            property="og:description"
            key="og:description"
            content="Find the performance impact of adding a npm package to your bundle."
          />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://bundlephobia.com" />
          <meta
            property="og:image"
            key="og:image"
            content="https://s26.postimg.org/4s64v24c9/Artboard_4.png"
          />
          <meta property="twitter:creator" content="@_pastelsky" />
        </Head>
        <DocumentHead>
          <script
            dangerouslySetInnerHTML={{
              __html: `
          window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
          ga('create', 'UA-53900935-9', 'auto');
        `,
            }}
          />
          <script async src="https://www.google-analytics.com/analytics.js" />
        </DocumentHead>
        <body>
          <Main />
          <NextScript />
        </body>
        <script
          src="https://browser.sentry-cdn.com/5.15.0/bundle.min.js"
          crossOrigin="anonymous"
        />
        <script
          src="https://browser.sentry-cdn.com/5.15.0/extraerrordata.min.js"
          crossOrigin="anonymous"
        />
        <script
          src="https://browser.sentry-cdn.com/5.15.0/captureconsole.min.js"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `Sentry.init({ 
              dsn: 'https://c28864debd5f47b2a89d05c74cd60c1c@sentry.io/5174673',
              release: "${process.env.RELEASE_DATE}",
              environment: "${process.env.NODE_ENV}",
              attachStacktrace: true
            })`,
          }}
        />
      </html>
    )
  }
}
