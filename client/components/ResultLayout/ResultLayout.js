import React, { Component } from 'react'
import cx from 'classnames'
import Link from 'next/link'

import Layout from 'client/components/Layout'

import GithubLogo from '../../assets/github-logo.svg'
import './ResultLayout.scss'
import PageNav from '../PageNav'

export default class ResultLayout extends Component {
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
