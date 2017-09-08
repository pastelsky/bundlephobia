import React from "react"
import Document, { Head, Main, NextScript } from "next/document"

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
        <title>
          BundlePhobia | find the cost of adding a npm package to your bundle
        </title>
        <meta name="application-name" content="BundlePhobia" />
        <meta
          name="description"
          content="find the performance impact of adding a npm package to your frontend bundle"
        />
        <link
          href="https://fonts.googleapis.com/css?family=Source+Code+Pro:300,400,600"
          rel="stylesheet"
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
        <script
          dangerouslySetInnerHTML={ {
            __html: `
          window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
          ga('create', 'UA-53900935-9', 'auto');
        `,
          } }
        />
        <script async src="https://www.google-analytics.com/analytics.js" />
      </Head>
      <body>
      <Main />
      <NextScript />
      </body>
      </html>
    )
  }
}
