import Link from 'next/link'
import React from 'react'
import GithubLogo from '../../assets/github-logo.svg'
import ThemeToggle from '../ThemeToggle'
import McpNavPopup from '../McpNavPopup/McpNavPopup'
import { BrandLogo, IconButton } from '../ui'

type PageNavProps = {
  minimal?: boolean
  variant?: 'full' | 'landing' | 'focused'
}

type NavigationLinksProps = {
  includeScan: boolean
}

const NavigationLinks = ({ includeScan }: NavigationLinksProps) => (
  <>
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
    <li>
      <Link href="/trends">Trends</Link>
    </li>
    {includeScan && (
      <li>
        <Link href="/scan">Scan package.json</Link>
      </li>
    )}
  </>
)

const MobileNavigation = ({ includeScan }: NavigationLinksProps) => (
  <details className="page-header__mobile-menu">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation">
      <ul>
        <NavigationLinks includeScan={includeScan} />
        <li>
          <McpNavPopup />
        </li>
      </ul>
    </nav>
  </details>
)

const PageNav = ({ minimal, variant }: PageNavProps) => {
  const resolvedVariant = variant ?? (minimal ? 'landing' : 'full')
  const showNavigation = resolvedVariant !== 'focused'

  return (
    <header className="page-header">
      {resolvedVariant !== 'landing' && (
        <section className="result-header--left-section">
          <BrandLogo />
        </section>
      )}
      <section className="page-header--right-section">
        {showNavigation && (
          <ul className="page-header__quicklinks">
            <NavigationLinks includeScan={resolvedVariant === 'full'} />
          </ul>
        )}
        {showNavigation && <McpNavPopup />}
        {showNavigation && (
          <MobileNavigation includeScan={resolvedVariant === 'full'} />
        )}
        <IconButton
          variant="quiet"
          label="Bundlephobia on GitHub"
          onClick={() =>
            window.open(
              'https://github.com/pastelsky/bundlephobia',
              '_blank',
              'noopener,noreferrer'
            )
          }
        >
          <GithubLogo />
        </IconButton>
        {resolvedVariant !== 'focused' && <ThemeToggle />}
      </section>
    </header>
  )
}

export default PageNav
