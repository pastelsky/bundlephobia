import React from 'react'
import Head from 'next/head'

import { type StructuredData, serializeJsonLd } from '../seo/structured-data'

export interface JsonLdProps {
  data?: StructuredData | null
  dangerouslySetInnerHTML?: { __html: string }
}

export default function JsonLd({ data, dangerouslySetInnerHTML }: JsonLdProps) {
  const json = data ? serializeJsonLd(data) : dangerouslySetInnerHTML?.__html

  if (!json) {
    return null
  }

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: json }}
      />
    </Head>
  )
}
