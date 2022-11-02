import React, { Component } from 'react'
import Sidebar from 'react-sidebar'
import Link from 'next/link'

import { WithClassName } from '../../../types'
import GithubLogo from '../../assets/github-logo.svg'

type HeaderProps = WithClassName

type HeaderState = {
  sidebarDocked: boolean
  sidebarOpen: boolean
}

export default class Header extends Component<HeaderProps, HeaderState> {
  mql!: MediaQueryList

  constructor(props: HeaderProps) {
    super(props)
    this.state = {
      sidebarDocked: false,
      sidebarOpen: false,
    }
  }

  componentDidMount() {
    this.mql = window.matchMedia(`(min-width: 800px)`)
    this.setState({ sidebarDocked: this.mql.matches })
    this.mql.addListener(this.mediaQueryChanged)
  }

  componentWillUnmount() {
    this.mql.removeListener(this.mediaQueryChanged)
  }

  onSetSidebarOpen(open: boolean) {
    this.setState({ sidebarOpen: open })
  }

  mediaQueryChanged() {
    this.setState({ sidebarDocked: this.mql.matches, sidebarOpen: false })
  }

  render() {
    return (
      <Sidebar
        sidebar={<b>Sidebar content</b>}
        open={this.state.sidebarOpen}
        docked={this.state.sidebarDocked}
        onSetOpen={this.onSetSidebarOpen}
      >
        <header className="page-header">
          <section className="result-header--left-section">
            <Link href="/">
              <div className="logo-small">
                <span>Bundle</span>
                <span className="logo-small__alt">Phobia</span>
              </div>
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
                  href="https://github.com/sponsors/pastelsky"
                >
                  Sponsor
                </a>
              </li>
              <li>
                <Link href="/scan">
                  Scan package.json <sup>β</sup>
                </Link>
              </li>
            </ul>
            <a target="_blank" href="https://github.com/pastelsky/bundlephobia">
              <GithubLogo />
            </a>
          </section>
        </header>
        <b>Main content</b>
      </Sidebar>
    )
  }
}
