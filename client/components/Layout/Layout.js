import React, { Component } from 'react'
import Link from 'next/link'
import API from '../../api'
import './Layout.scss'

import Heart from '../../assets/heart.svg'
import DigitalOceanLogo from '../../assets/digital-ocean-logo.svg'

export default class Layout extends Component {
  state = {
    recentSearches: [],
  }

  componentDidMount() {
    API.getRecentSearches(5).then(searches => {
      this.setState({
        recentSearches: Object.keys(searches),
      })
    })
  }

  render() {
    const { children, className } = this.props
    const { recentSearches } = this.state

    return (
      <section className="layout">
        <section className={className}>{children}</section>

        <footer>
          <div className="footer__recent-search-bar">
            <div className="footer__recent-search-bar__wrap">
              <h4>Recent searches</h4>
              <ul className="footer__recent-search-list">
                {recentSearches.map(search => (
                  <li key={search}>
                    <Link href={`/package/${search}`}>
                      <a>{search}</a>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <section className="footer__split">
            <div className="footer__description">
              <h3> What does Bundlephobia do? </h3>
              <p>
                JavaScript bloat is more real today than it ever was. Sites
                continuously get bigger as more (often redundant) libraries are
                thrown to solve new problems. Until of-course, the{' '}
                <i> big rewrite </i>
                happens.
              </p>
              <p>
                Bundlephobia lets you understand the performance cost of
                <code>npm&nbsp;install</code> ing a new npm package before it
                becomes a part of your bundle. Analyze size, compositions and
                exports
              </p>
              <p>
                Credits to{' '}
                <a href="https://twitter.com/thekitze" target="_blank">
                  {' '}
                  @thekitze{' '}
                </a>
                for the name.
              </p>
              <div className="footer__hosting-credits">
                Hosted on
                <a href="https://digitalocean.com" target="_blank">
                  <DigitalOceanLogo className="footer__sponsor-logo" />
                </a>
              </div>
            </div>
            <div className="footer__credits">
              <Heart className="footer__credits__heart" />️
              <a
                className="footer__credits-profile"
                target="_blank"
                href="https://github.com/pastelsky"
              >
                @pastelsky
              </a>
              <a
                target="_blank"
                href="https://github.com/pastelsky/bundlephobia"
              >
                <button className="footer__credits-fork-button">
                  Star on GitHub
                </button>
              </a>
            </div>
          </section>
        </footer>
      </section>
    )
  }
}
