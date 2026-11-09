import React from 'react'
import Head from 'next/head'

export const DEFAULT_DESCRIPTION_START =
  'Bundlephobia helps you find the performance impact of npm packages.'

type MetaTagsProps = {
  title: string
  canonicalPath: string
  description?: string
  twitterDescription?: string
  image?: string
  isLargeImage?: boolean
  structuredDataJson?: string
}

export default function MetaTags({
  description,
  twitterDescription,
  title,
  canonicalPath,
  image,
  isLargeImage,
  structuredDataJson,
}: MetaTagsProps) {
  const defaultDescription = `${DEFAULT_DESCRIPTION_START} Find the size of any javascript package and its effect on your frontend bundle.`
  const metaDescription = description || defaultDescription
  const metaImage =
    image || 'https://bundlephobia.com/android-chrome-256x256.png'
  const cardType = isLargeImage ? 'summary_large_image' : 'summary'

  const origin =
    typeof window === 'undefined'
      ? 'https://bundlephobia.com'
      : window.location.origin

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={metaDescription} />
      <meta property="og:title" key="og:title" content={title} />
      <meta
        property="og:description"
        key="og:description"
        content={metaDescription}
      />
      <meta property="og:type" key="og:type" content="website" />
      <meta property="og:url" key="og:url" content={origin + canonicalPath} />
      <meta property="og:image" key="og:image" content={metaImage} />
      <meta
        property="twitter:creator"
        key="twitter:creator"
        content="@_pastelsky"
      />
      <meta property="twitter:title" key="twitter:title" content={title} />
      <meta property="twitter:image" key="twitter:image" content={metaImage} />
      {twitterDescription && (
        <meta
          property="twitter:description"
          key="twitter:description"
          content={twitterDescription}
        />
      )}
      <meta name="twitter:card" key="twitter:card" content={cardType} />
      <link rel="canonical" href={origin + canonicalPath} />
      {structuredDataJson && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: structuredDataJson,
          }}
        />
      )}
    </Head>
  )
}
