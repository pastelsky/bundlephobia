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
      <Layout skipTo="page-content">
        <div className={cx('page-container', className)}>
          <PageNav variant="full" />
          <div className="page-content" id="page-content" tabIndex={-1}>
            {children}
          </div>
        </div>
      </Layout>
    )
  }
}
