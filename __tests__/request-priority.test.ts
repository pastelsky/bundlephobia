import type { Context } from 'koa'

import Queue from '../server/infrastructure/queue.service'
import { getRequestAging, getRequestPriority } from '../utils/server.utils'

function contextFor(client?: string, clientType?: string): Context {
  const headers: Record<string, string> = {}

  if (client) headers['x-bundlephobia-user'] = client

  if (clientType) headers['x-bundlephobia-client-type'] = clientType

  const context = { headers }

  // SAFETY: this fixture only exercises the request headers read by the priority helper.
  return context as Context
}

describe('request priority', () => {
  it('prioritizes website requests over MCP and public API requests', () => {
    expect(getRequestPriority(contextFor('bundlephobia website'))).toBe(
      Queue.priority.HIGH,
    )
    expect(getRequestPriority(contextFor('bundlephobia mcp tool'))).toBe(
      Queue.priority.MEDIUM,
    )
    expect(getRequestPriority(contextFor())).toBe(Queue.priority.LOW)
    expect(getRequestPriority(contextFor('unknown api client'))).toBe(
      Queue.priority.LOW,
    )
  })

  it('keeps Yarn requests at low priority', () => {
    expect(getRequestPriority(contextFor('yarn website'))).toBe(
      Queue.priority.LOW,
    )
  })

  it('disables queue aging only for proxy-classified bots', () => {
    expect(getRequestAging(contextFor(undefined, 'bot'))).toBe(false)
    expect(getRequestAging(contextFor(undefined, 'non_bot'))).toBe(true)
    expect(getRequestAging(contextFor('bundlephobia website'))).toBe(true)
  })
})
