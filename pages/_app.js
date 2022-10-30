import React from 'react'
import Head from 'next/head'
import '../stylesheets/index.scss'
import '../stylesheets/AutocompleteInput.scss'
import '../stylesheets/AutocompleteInputBox.scss'
import '../stylesheets/BarGraph.scss'
import '../stylesheets/BlogLayout.scss'
import '../stylesheets/BuildProgressIndicator.scss'
import '../stylesheets/ComparePage.scss'
import '../stylesheets/ExportAnalysisSection.scss'
import '../stylesheets/InterLinksSection.scss'
import '../stylesheets/InterLinksSectionCard.scss'
import '../stylesheets/JumpingDots.scss'
import '../stylesheets/Layout.scss'
import '../stylesheets/ProgressHex.scss'
import '../stylesheets/QuickStatsBar.scss'
import '../stylesheets/ResultLayout.scss'
import '../stylesheets/ResultPage.scss'
import '../stylesheets/Scan.scss'
import '../stylesheets/SideEffectIcon.scss'
import '../stylesheets/SimilarPackageCard.scss'
import '../stylesheets/SimilarPackagesSection.scss'
import '../stylesheets/Stat.scss'
import '../stylesheets/TreeShakeIcon.scss'
import '../stylesheets/Warning.scss'

function App({ Component, pageProps }) {
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
