import Link from 'next/link'
import React from 'react'
import GithubLogo from '../../assets/github-logo.svg'

type PageNavProps = {
  minimal?: boolean
}

export const PageNav = ({ minimal }: PageNavProps) => (
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
          <Link href="/blog">Blog</Link>
        </li>
        {!minimal && (
          <li>
            <Link href="/scan">Scan package.json</Link>
          </li>
        )}
      </ul>
      <a
        target="_blank"
        href="https://github.com/pastelsky/bundlephobia"
        rel="noreferrer"
      >
        <GithubLogo />
      </a>
    </section>
  </header>
)
