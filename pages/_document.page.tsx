import React from 'react'
import Document, {
  DocumentContext,
  Head as DocumentHead,
  Html,
  Main,
  NextScript,
} from 'next/document'

// Applied before React hydrates to avoid flash of wrong theme.
// Sets data-theme on <html> from localStorage or prefers-color-scheme.
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)

    return { ...initialProps }
  }

  render() {
    return (
      <Html lang="en">
        <DocumentHead>
          <meta charSet="utf-8" />
          <meta httpEquiv="x-ua-compatible" content="ie=edge" />
          <meta name="application-name" content="Bundlephobia" />
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
          <meta name="apple-mobile-web-app-title" content="Bundlephobia" />
          <meta name="application-name" content="Bundlephobia" />
          <meta name="theme-color" content="#212121" />

          <meta
            name="google-site-verification"
            content="XizU-iXvsrtQJG5G4DWEGhD57SRRA8x3Y9FnSwk53X0"
          />
        </DocumentHead>
        <body>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
          <Main />
          <NextScript />
        </body>

        {/* See https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-javascript-proxy-api */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
          if ("Proxy" in window) {
            var handler = {
              get: function(_, key) {
                return new Proxy(function(cb) {
                  if (key === "flush" || key === "close") return Promise.resolve();
                  if (typeof cb === "function") return cb(window.Sentry);
                  return window.Sentry;
                }, handler);
              },
            };
            window.Sentry = new Proxy({}, handler);
          }
        `,
          }}
        />
        <script
          src="https://browser.sentry-cdn.com/5.15.0/bundle.min.js"
          crossOrigin="anonymous"
          defer
        />
        <script
          src="https://browser.sentry-cdn.com/5.15.0/extraerrordata.min.js"
          crossOrigin="anonymous"
          defer
        />
        <script
          src="https://browser.sentry-cdn.com/5.15.0/captureconsole.min.js"
          crossOrigin="anonymous"
          defer
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('DOMContentLoaded', function() {
              Sentry.init({
                dsn: 'https://c28864debd5f47b2a89d05c74cd60c1c@sentry.io/5174673',
                release: "${process.env.RELEASE_DATE}",
                environment: "${process.env.NODE_ENV}",
                attachStacktrace: true
              });
            }, { once: true });`,
          }}
        />
      </Html>
    )
  }
}
