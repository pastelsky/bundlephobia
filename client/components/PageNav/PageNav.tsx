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
            {resolvedVariant === 'full' && (
              <li>
                <Link href="/scan">Scan package.json</Link>
              </li>
            )}
          </ul>
        )}
        {showNavigation && <McpNavPopup />}
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
