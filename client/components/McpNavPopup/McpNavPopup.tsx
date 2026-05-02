import React, { useState } from 'react'
import Analytics from '../../analytics'

const McpNavPopup = () => {
  const [open, setOpen] = useState(false)
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
    Analytics.mcpSetupSnippetCopied()
  }

  return (
    <li className="mcp-nav">
      <button className="mcp-nav__trigger" onClick={onToggle} type="button">
        MCP
      </button>
      {open && (
        <div className="mcp-nav__popup">
          <p className="mcp-nav__title">
            Use Bundlephobia as a remote MCP server
          </p>
          <p className="mcp-nav__tools">
            Add this to your MCP client configuration:
          </p>
          <pre className="mcp-nav__result">{setupSnippet}</pre>
          <div className="mcp-nav__row">
            <button
              className="mcp-nav__button"
              type="button"
              onClick={onCopySnippet}
            >
              Copy Snippet
            </button>
          </div>
          <a
            className="mcp-nav__docs-link"
            target="_blank"
            rel="noreferrer noopener"
            href="/api/mcp"
            onClick={() => Analytics.mcpDocsOpened()}
          >
            Open MCP endpoint docs
          </a>
        </div>
      )}
    </li>
  )
}

export default McpNavPopup
