import React from 'react'
import Head from 'next/head'

type DataPreloaderProps = {
  urls: (string | null | undefined | false)[]
}

function isNonEmptyString(
  value: string | null | undefined | false,
): value is string {
  return Boolean(value)
}

export default function DataPreloader({ urls }: DataPreloaderProps) {
  const validUrls = urls.filter(isNonEmptyString)

  if (validUrls.length === 0) {
    return null
  }

  // Preload script runs synchronously inline in <head> during initial HTML parsing,
  // firing fetch() immediately so the network request runs in parallel with JavaScript bundle downloads.
  const scriptContent = `(function(){window.__BP_PRELOAD__=window.__BP_PRELOAD__||{};${validUrls
    .map(
      url =>
        `window.__BP_PRELOAD__[${JSON.stringify(url)}]=fetch(${JSON.stringify(
          url,
        )},{headers:{Accept:'application/json','X-Bundlephobia-User':'bundlephobia website'}});`,
    )
    .join('')}})();`

  return (
    <Head>
      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Head>
  )
}
