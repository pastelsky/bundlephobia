import React, { useState } from 'react'
import Analytics from '../../analytics'

const McpNavPopup = () => {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const setupSnippet = `{
  "mcpServers": {
    "bundlephobia": {
      "url": "https://bundlephobia.com/api/mcp"
    }
  }
}`

  const onToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)
    Analytics.mcpHeaderClicked({ open: nextOpen })
  }

  const onCopySnippet = async () => {
    await navigator.clipboard.writeText(setupSnippet)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
    Analytics.mcpSetupSnippetCopied()
  }

  return (
    <div className="mcp-nav">
      <button className="mcp-nav__trigger" onClick={onToggle} type="button">
        MCP
      </button>
      {open && (
        <div className="mcp-nav__popup">
          <div className="mcp-nav__code-wrap">
            <button
              className={`mcp-nav__copy-icon ${
                copied ? 'mcp-nav__copy-icon--copied' : ''
              }`}
              type="button"
              onClick={onCopySnippet}
              aria-label="Copy MCP snippet"
              title="Copy"
            >
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
            </button>
            <pre className="mcp-nav__result">{setupSnippet}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default McpNavPopup
