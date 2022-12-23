import React from 'react'
import Document, {
  DocumentContext,
  Head as DocumentHead,
  Html,
  Main,
  NextScript,
} from 'next/document'

const amplitudeScript = `
(function(e,t){var n=e.amplitude||{_q:[],_iq:{}};var r=t.createElement("script")
;r.type="text/javascript"
;r.integrity="sha384-girahbTbYZ9tT03PWWj0mEVgyxtZoyDF9KVZdL+R53PP5wCY0PiVUKq0jeRlMx9M"
;r.crossOrigin="anonymous";r.async=true
;r.src="https://cdn.amplitude.com/libs/amplitude-7.2.1-min.gz.js"
;r.onload=function(){if(!e.amplitude.runQueuedFunctions){
console.log("[Amplitude] Error: could not load SDK")}}
;var i=t.getElementsByTagName("script")[0];i.parentNode.insertBefore(r,i)
;function s(e,t){e.prototype[t]=function(){
this._q.push([t].concat(Array.prototype.slice.call(arguments,0)));return this}}
var o=function(){this._q=[];return this}
;var a=["add","append","clearAll","prepend","set","setOnce","unset"]
;for(var c=0;c<a.length;c++){s(o,a[c])}n.Identify=o;var u=function(){this._q=[]
;return this}
;var l=["setProductId","setQuantity","setPrice","setRevenueType","setEventProperties"]
;for(var p=0;p<l.length;p++){s(u,l[p])}n.Revenue=u
;var d=["init","logEvent","logRevenue","setUserId","setUserProperties","setOptOut","setVersionName","setDomain","setDeviceId","enableTracking","setGlobalUserProperties","identify","clearUserProperties","setGroup","logRevenueV2","regenerateDeviceId","groupIdentify","onInit","logEventWithTimestamp","logEventWithGroups","setSessionId","resetSessionId"]
;function v(e){function t(t){e[t]=function(){
e._q.push([t].concat(Array.prototype.slice.call(arguments,0)))}}
for(var n=0;n<d.length;n++){t(d[n])}}v(n);n.getInstance=function(e){
e=(!e||e.length===0?"$default_instance":e).toLowerCase()
;if(!n._iq.hasOwnProperty(e)){n._iq[e]={_q:[]};v(n._iq[e])}return n._iq[e]}
;e.amplitude=n})(window,document);

  amplitude.getInstance()
   .init(
     "a9919b09b92f868530fb24f628bd35c0",
      undefined, 
      {includeReferrer: true, includeUtm: true, includeGclid: true}
    );
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
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="true"
          />
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
          <meta name="apple-mobile-web-app-title" content="Bundlephobia" />
          <meta name="application-name" content="Bundlephobia" />
          <meta name="theme-color" content="#212121" />

          <meta
            name="google-site-verification"
            content="XizU-iXvsrtQJG5G4DWEGhD57SRRA8x3Y9FnSwk53X0"
          />
          <script
            dangerouslySetInnerHTML={{
              __html: amplitudeScript,
            }}
          />
        </DocumentHead>
        <body>
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
      </Html>
    )
  }
}
