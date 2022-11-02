import { HookQueryProps } from 'react-contentful'
import { Document } from '@contentful/rich-text-types'

declare module 'react-contentful' {
  interface Item {
    fields: {
      title: string
      content: Document
      slug: string
      createdAt: string
    }
    sys: {
      createdAt: string
    }
  }

  interface Data {
    items: Item[]
  }

  interface TypedHookResponse {
    data?: Data
    error?: any
    fetched: boolean
    loading: boolean
  }

  export function useContentful(props: HookQueryProps): TypedHookResponse
}
