import 'dotenv-defaults/config'

import type { Context } from 'koa'

import Queue from '../server/Queue'

export function getRequestPriority(ctx: Context): number {
  const client = ctx.headers['x-bundlephobia-user']

  switch (client) {
    case 'bundlephobia website':
      return Queue.priority.HIGH
    case 'bundlephobia mcp tool':
      return Queue.priority.MEDIUM
    case 'yarn website':
    default:
      return Queue.priority.LOW
  }
}
