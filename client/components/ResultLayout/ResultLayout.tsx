import React from 'react'
import cx from 'classnames'

import { Layout } from '../../components/Layout'
import { PageNav } from '../PageNav'
import { WithClassName } from '../../../types'

type ResultLayoutProps = React.PropsWithChildren<WithClassName>

export function ResultLayout({ children, className }: ResultLayoutProps) {
  return (
    <Layout>
      <div className={cx('page-container', className)}>
        <PageNav />
        <div className="page-content">{children}</div>
      </div>
    </Layout>
  )
}
