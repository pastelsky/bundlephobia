import React, { useEffect, useRef, useState } from 'react'
import Analytics from '../../analytics'
import { IconButton } from '../ui/IconButton'

const McpNavPopup = () => {
  const [copied, setCopied] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const details = detailsRef.current
      if (details?.open && !details.contains(event.target as Node)) {
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

  return (
    <details
      ref={detailsRef}
      className="mcp-nav"
      onToggle={event => {
        if (event.currentTarget.open) {
          Analytics.mcpHeaderClicked({ open: true })
        }
      }}
    >
      <summary className="mcp-nav__trigger" aria-label="MCP setup instructions">
        MCP
      </summary>
      <div className="mcp-nav__popup">
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
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
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
    </details>
  )
}

export default McpNavPopup
