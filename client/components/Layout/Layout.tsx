import React, { Component } from 'react'
import Link from 'next/link'

import Heart from '../../assets/heart.svg'
import DigitalOceanLogo from '../../assets/digital-ocean-logo.svg'
import { AnnouncementBanner } from '../AnnouncementBanner'
import { WithClassName } from '../../../types'

type LayoutProps = React.PropsWithChildren & WithClassName

const popularPackages = ['react', 'axios', 'zod', 'date-fns', 'zustand']

export default class Layout extends Component<LayoutProps> {
  render() {
    const { children, className } = this.props

    return (
      <section className="layout">
        <AnnouncementBanner />
        <section className={className}>{children}</section>

        <footer>
          <div className="footer__recent-search-bar">
            <div className="footer__recent-search-bar__wrap">
              <h4>Popular packages</h4>
              <ul className="footer__recent-search-list">
                {popularPackages.map(search => (
                  <li key={search}>
                    <Link href={`/package/${search}`}>{search}</Link>
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
              <nav className="footer__links" aria-label="Footer navigation">
                <Link href="/blog">Blog</Link>
              </nav>
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
