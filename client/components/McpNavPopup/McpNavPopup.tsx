import React, { useState } from 'react'
import API from '../../api'
import Analytics from '../../analytics'

type McpTool = {
  name?: string
}

type McpToolsResponse = {
  tools?: McpTool[]
}

const McpNavPopup = () => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [toolName, setToolName] = useState('')
  const [toolArgs, setToolArgs] = useState('{}')
  const [result, setResult] = useState('')

  const onToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)
    Analytics.mcpHeaderClicked({ open: nextOpen })
    if (!nextOpen) {
      setError('')
    }
  }

  const onListTools = async () => {
    setLoading(true)
    setError('')
    setResult('')
    try {
      const response = await API.get<McpToolsResponse>('/api/mcp/tools')
      const names = (response.tools ?? [])
        .map(tool => tool.name)
        .filter((name): name is string => Boolean(name))
      setTools(names)
      Analytics.mcpToolsListed({ toolCount: names.length })
    } catch (e) {
      setError('Unable to fetch MCP tools')
      Analytics.mcpActionFailed({ action: 'list-tools' })
    } finally {
      setLoading(false)
    }
  }

  const onCallTool = async () => {
    setLoading(true)
    setError('')
    setResult('')
    try {
      const parsedArgs = toolArgs.trim() ? JSON.parse(toolArgs) : {}
      const response = await API.post('/api/mcp/call-tool', {
        name: toolName,
        arguments: parsedArgs,
      })
      setResult(JSON.stringify(response, null, 2))
      Analytics.mcpToolCalled({ toolName })
    } catch (e) {
      setError('Tool call failed. Check tool name/arguments.')
      Analytics.mcpActionFailed({ action: 'call-tool' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <li className="mcp-nav">
      <button className="mcp-nav__trigger" onClick={onToggle} type="button">
        MCP
      </button>
      {open && (
        <div className="mcp-nav__popup">
          <div className="mcp-nav__row">
            <button
              className="mcp-nav__button"
              type="button"
              onClick={onListTools}
              disabled={loading}
            >
              List Tools
            </button>
          </div>
          {tools.length > 0 && (
            <p className="mcp-nav__tools">{tools.slice(0, 8).join(', ')}</p>
          )}
          <input
            className="mcp-nav__input"
            value={toolName}
            onChange={event => setToolName(event.target.value)}
            placeholder="tool name"
          />
          <textarea
            className="mcp-nav__textarea"
            value={toolArgs}
            onChange={event => setToolArgs(event.target.value)}
            placeholder='{"key":"value"}'
          />
          <div className="mcp-nav__row">
            <button
              className="mcp-nav__button"
              type="button"
              onClick={onCallTool}
              disabled={loading || !toolName.trim()}
            >
              Call Tool
            </button>
          </div>
          {error ? <p className="mcp-nav__error">{error}</p> : null}
          {result ? <pre className="mcp-nav__result">{result}</pre> : null}
        </div>
      )}
    </li>
  )
}

export default McpNavPopup
