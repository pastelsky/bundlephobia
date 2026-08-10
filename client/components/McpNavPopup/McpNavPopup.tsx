import React, { useState } from 'react'
import Analytics from '../../analytics'
import { IconButton, Popover } from '../ui'

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
    <div className="mcp-nav">
      <Popover
        label="Open MCP setup instructions"
        trigger={
          <button
            className="mcp-nav__trigger"
            onClick={() => Analytics.mcpHeaderClicked({ open: true })}
          >
            MCP
          </button>
        }
      >
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
      </Popover>
    </div>
  )
}

export default McpNavPopup
