import React from 'react'

import { WithClassName } from '../../../types'
import { ResultLayout } from '../ResultLayout'

type BlogLayoutProps = React.PropsWithChildren & WithClassName

export const BlogLayout = ({ className, children }: BlogLayoutProps) => (
  <ResultLayout className={className}>
    <div className="blog-layout__container">{children}</div>
  </ResultLayout>
)
