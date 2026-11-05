import React, { useCallback, useState, useSyncExternalStore } from 'react'
import Sidebar from 'react-sidebar'
import Link from 'next/link'

import GithubLogo from '../../assets/github-logo.svg'
import McpNavPopup from '../McpNavPopup/McpNavPopup'

const SIDEBAR_MEDIA_QUERY = '(min-width: 800px)'

function useSidebarDocked() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mediaQuery = window.matchMedia(SIDEBAR_MEDIA_QUERY)
    mediaQuery.addEventListener('change', onStoreChange)

    return () => mediaQuery.removeEventListener('change', onStoreChange)
  }, [])

  const getSnapshot = useCallback(
    () => window.matchMedia(SIDEBAR_MEDIA_QUERY).matches,
    [],
  )

  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export default function Header() {
  const sidebarDocked = useSidebarDocked()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const onSetSidebarOpen = useCallback(
    (open: boolean) => setSidebarOpen(open),
    [],
  )

  return (
    <Sidebar
      sidebar={<b>Sidebar content</b>}
      open={sidebarOpen}
      docked={sidebarDocked}
      onSetOpen={onSetSidebarOpen}
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
            <McpNavPopup />
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
