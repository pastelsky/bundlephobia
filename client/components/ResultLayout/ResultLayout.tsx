import React, { Component } from 'react'
import cx from 'classnames'

import Layout from '../../components/Layout'
import PageNav from '../PageNav'
import { WithClassName } from '../../../types'

export default class ResultLayout extends Component<
  React.PropsWithChildren & WithClassName
> {
  render() {
    const { children, className } = this.props
    return (
      <Layout>
        <div className={cx('page-container', className)}>
          <PageNav />
          <div className="page-content">{children}</div>
        </div>
      </Layout>
    )
  }
}
