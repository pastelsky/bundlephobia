declare module '*.scss' {
  const content: { [className: string]: string }
  export default content
}

declare module '*.svg' {
  import type { FunctionComponent, SVGProps } from 'react'

  const component: FunctionComponent<SVGProps<SVGSVGElement>>
  export default component
}
