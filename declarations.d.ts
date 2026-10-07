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
  interface NpmRegistryFetch {
    json<T>(path: string): Promise<T>
  }

  const registryFetch: NpmRegistryFetch
  export = registryFetch
}
