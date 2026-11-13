declare module '*.scss' {
  const content: { [className: string]: string }
  export default content
}

declare module '*.svg' {
  import type { FunctionComponent, SVGProps } from 'react'

  const component: FunctionComponent<SVGProps<SVGSVGElement>>
  export default component
}

declare module 'pacote' {
  interface PacoteOptions {
    fullMetadata: boolean
  }

  interface Pacote {
    manifest<T>(spec: string, options: PacoteOptions): Promise<T>
    packument<T>(spec: string, options: PacoteOptions): Promise<T>
  }

  const pacote: Pacote
  export = pacote
}

declare module 'npm-registry-fetch' {
  interface NpmRegistryFetchResponse {
    status: number
    ok: boolean
    body: NodeJS.ReadableStream
  }

  interface NpmRegistryFetchOptions {
    headers?: Record<string, string>
    timeout?: number
  }

  interface NpmRegistryFetch {
    (
      path: string,
      options?: NpmRegistryFetchOptions,
    ): Promise<NpmRegistryFetchResponse>
    json<T>(path: string): Promise<T>
  }

  const registryFetch: NpmRegistryFetch
  export = registryFetch
}
