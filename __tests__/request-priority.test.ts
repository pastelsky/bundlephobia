import type { Context } from 'koa'

import Queue from '../server/Queue'
import { getRequestPriority } from '../utils/server.utils'

function contextFor(client?: string): Context {
  return {
    headers: client ? { 'x-bundlephobia-user': client } : {},
  } as unknown as Context
}

describe('request priority', () => {
  it('prioritizes website requests over MCP and public API requests', () => {
    expect(getRequestPriority(contextFor('bundlephobia website'))).toBe(
      Queue.priority.HIGH
    )
    expect(getRequestPriority(contextFor('bundlephobia mcp tool'))).toBe(
      Queue.priority.MEDIUM
    )
    expect(getRequestPriority(contextFor())).toBe(Queue.priority.LOW)
    expect(getRequestPriority(contextFor('unknown api client'))).toBe(
      Queue.priority.LOW
    )
  })

  it('keeps Yarn requests at low priority', () => {
    expect(getRequestPriority(contextFor('yarn website'))).toBe(
      Queue.priority.LOW
    )
  })
})
