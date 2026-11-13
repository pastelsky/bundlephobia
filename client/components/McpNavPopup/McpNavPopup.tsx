import React, { useState } from 'react'
import Analytics from '../../analytics'
import { IconButton } from '../ui/IconButton'

const McpNavPopup = () => {
  const [copied, setCopied] = useState(false)

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
            label="Copy MCP snippet"
            variant="quiet"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"
              />
            </svg>
          </IconButton>
          <pre className="mcp-nav__result">{setupSnippet}</pre>
        </div>
      </div>
    </details>
  )
}

export default McpNavPopup
