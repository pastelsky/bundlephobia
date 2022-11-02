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
}

export default function MetaTags({
  description,
  twitterDescription,
  title,
  canonicalPath,
  image,
  isLargeImage,
}: MetaTagsProps) {
  const defaultDescription = `${DEFAULT_DESCRIPTION_START} Find the size of any javascript package and its effect on your frontend bundle.`
  const defaultImage = 'https://bundlephobia.com/android-chrome-256x256.png'
  const origin =
    typeof window === 'undefined'
      ? 'https://bundlephobia.com'
      : window.location.origin

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description || defaultDescription} />
      <meta property="og:title" key="og:title" content={title} />
      <meta
        property="og:description"
        key="og:description"
        content={description || defaultDescription}
      />
      <meta property="og:type" key="og:type" content="website" />
      <meta property="og:url" key="og:url" content={origin + canonicalPath} />
      <meta
        property="og:image"
        key="og:image"
        content={image || defaultImage}
      />
      <meta
        property="twitter:creator"
        key="twitter:creator"
        content="@_pastelsky"
      />
      {twitterDescription && (
        <meta
          property="twitter:description"
          key="twitter:description"
          content={twitterDescription}
        />
      )}
      {isLargeImage ? (
        <meta
          name="twitter:card"
          key="twitter:card"
          content="summary_large_image"
        />
      ) : (
        <meta name="twitter:card" content="summary" key="summary" />
      )}
      <link rel="canonical" href={origin + canonicalPath} />
    </Head>
  )
}
