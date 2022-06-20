import Link from 'next/link'
import React from 'react'
import GithubLogo from '../../assets/github-logo.svg'

const PageNav = ({ minimal }) => (
  <header className="page-header">
    {!minimal && (
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
    )}
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
            Sponsor
          </a>
        </li>
        <li>
          <Link href="/blog">
            <a>Blog</a>
          </Link>
        </li>
        {!minimal && (
          <li>
            <Link href="/scan">
              <a>Scan package.json</a>
            </Link>
          </li>
        )}
      </ul>
      <a target="_blank" href="https://github.com/pastelsky/bundlephobia">
        <GithubLogo />
      </a>
    </section>
  </header>
)

export default PageNav
