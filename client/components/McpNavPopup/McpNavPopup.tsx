import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Analytics from '../../analytics'
import { IconButton } from '../ui/IconButton'

const McpNavPopup = () => {
  const [copied, setCopied] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 40em)')
    const syncMedia = () => setIsMobile(mql.matches)

    syncMedia()
    mql.addEventListener('change', syncMedia)

    return () => mql.removeEventListener('change', syncMedia)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const details = detailsRef.current
      const target = event.target

      if (!details?.open || !(target instanceof Node)) return

      const insideDetails = details.contains(target)
      const insidePortal = portalRef.current?.contains(target) ?? false

      if (!insideDetails && !insidePortal) {
        details.open = false
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const details = detailsRef.current

      if (event.key === 'Escape' && details?.open) {
        details.open = false
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const setupSnippet = `{
  "mcpServers": {
    "bundlephobia": {
      "url": "https://bundlephobia.com/api/mcp"
    }
  }
}`

  const onCopySnippet = async () => {
    await navigator.clipboard.writeText(setupSnippet)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
    Analytics.mcpSetupSnippetCopied()
  }

  const closePopup = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false
    }
  }

  const popupContent = (
    <div className="mcp-nav__popup" role="dialog" aria-label="MCP setup">
      <div className="mcp-nav__header">
        <div>
          <div className="mcp-nav__title">MCP Server</div>
          <div className="mcp-nav__subtitle">Add to your AI client config</div>
        </div>
        <button
          type="button"
          className="mcp-nav__close"
          onClick={closePopup}
          aria-label="Close MCP setup"
        >
          ×
        </button>
      </div>
      <div className="mcp-nav__code-wrap">
        <IconButton
          className={`mcp-nav__copy-icon ${
            copied ? 'mcp-nav__copy-icon--copied' : ''
          }`}
          onClick={onCopySnippet}
          label={copied ? 'Copied MCP snippet' : 'Copy MCP snippet'}
          variant="quiet"
        >
          {copied ? (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"
              />
            </svg>
          )}
        </IconButton>
        <pre className="mcp-nav__result">{setupSnippet}</pre>
      </div>
    </div>
  )

  return (
    <details
      ref={detailsRef}
      className="mcp-nav"
      onToggle={event => {
        const nextOpen = event.currentTarget.open

        setIsOpen(nextOpen)

        if (nextOpen) {
          Analytics.mcpHeaderClicked({ open: true })
        }
      }}
    >
      <summary className="mcp-nav__trigger" aria-label="MCP setup instructions">
        MCP
      </summary>
      {isOpen && isMobile && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={portalRef}
              className="mcp-nav__backdrop"
              role="presentation"
              onMouseDown={event => {
                if (event.target === event.currentTarget) {
                  closePopup()
                }
              }}
            >
              {popupContent}
            </div>,
            document.body,
          )
        : popupContent}
    </details>
  )
}

export default McpNavPopup
