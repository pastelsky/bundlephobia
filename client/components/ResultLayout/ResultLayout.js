import React, { Component } from 'react'
import cx from 'classnames'
import Link from 'next/link'

import Layout from 'client/components/Layout'

import GithubLogo from '../../assets/github-logo.svg'
import './ResultLayout.scss'

export default class ResultLayout extends Component {
  render() {
    const { children, className } = this.props
    return (
      <Layout>
        <div className={cx('page-container', className)}>
          <header className="page-header">
            <section className="result-header--left-section">
              <Link href="/">
                <a>
                  <div className="logo-small">
                    <span>Bundle</span>
                    <span className="logo-small__alt">Phobia</span>
                  </div>
                </a>
              </Link>
            </section>
            <section className="page-header--right-section">
              <ul className="page-header__quicklinks">
                <li>
                  <a
                    target="_blank"
                    rel="noreferrer noopener"
                    href="https://badgen.net/#bundlephobia"
                  >
                    Badges
                  </a>
                </li>
                <li>
                  <a
                    target="_blank"
                    rel="noreferrer noopener"
                    href="https://opencollective.com/bundlephobia"
                  >
                    Opencollective
                  </a>
                </li>
                <li>
                  <Link href="/scan">
                    <a>
                      Scan package.json <sup>β</sup>
                    </a>
                  </Link>
                </li>
              </ul>
              <a
                target="_blank"
                href="https://github.com/pastelsky/bundlephobia"
              >
                <GithubLogo />
              </a>
            </section>
          </header>
          <div className="page-content">{children}</div>
        </div>
      </Layout>
    )
  }
}
