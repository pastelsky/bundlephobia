import Link from 'next/link'
import React from 'react'
import GithubLogo from '../../assets/github-logo.svg'
import ThemeToggle from '../ThemeToggle'
import McpNavPopup from '../McpNavPopup/McpNavPopup'

type PageNavProps = {
  minimal?: boolean
}

const PageNav = ({ minimal }: PageNavProps) => (
  <header className="page-header">
    {!minimal && (
      <section className="result-header--left-section">
        <Link href="/">
          <div className="logo-small">
            <span>Bundle</span>
            <span className="logo-small__alt">Phobia</span>
          </div>
        </Link>
      </section>
    )}
    <section className="page-header--right-section">
      <nav className="page-header__navigation" aria-label="Primary navigation">
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
            <Link href="/compare">Compare</Link>
          </li>
          <li>
            <Link href="/trends">Trends</Link>
          </li>
          {!minimal && (
            <li>
              <Link href="/scan">Scan package.json</Link>
            </li>
          )}
        </ul>
      </nav>
      <div className="page-header__utilities">
        <details className="page-header__mobile-menu">
          <summary aria-label="Open navigation menu">Menu</summary>
          <nav aria-label="Mobile navigation">
            <ul>
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
                <Link href="/compare">Compare</Link>
              </li>
              <li>
                <Link href="/trends">Trends</Link>
              </li>
              {!minimal && (
                <li>
                  <Link href="/scan">Scan package.json</Link>
                </li>
              )}
            </ul>
          </nav>
        </details>
        <McpNavPopup />
        <a
          className="page-header__github-link"
          target="_blank"
          rel="noreferrer noopener"
          href="https://github.com/pastelsky/bundlephobia"
          aria-label="Bundlephobia on GitHub"
        >
          <GithubLogo />
        </a>
        <ThemeToggle />
      </div>
    </section>
  </header>
)

export default PageNav
