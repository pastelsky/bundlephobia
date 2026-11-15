import crypto from 'node:crypto'
import exec from 'execa'
import { removePaths } from '../../scripts/cleanup.mts'
import type { Context, Middleware } from 'koa'

export interface AdminController {
  restart: Middleware
  restartWithBody: Middleware
  clearCache: Middleware
}

type BodyRequest = Context['request'] & {
  body?: { name?: string; pass?: string }
}

function safeCompare(a: string | undefined, b: string): boolean {
  if (typeof a === 'undefined') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  if (bufA.length !== bufB.length) return false

  return crypto.timingSafeEqual(bufA, bufB)
}

export function createAdminController(password: string): AdminController {
  return {
    restart: async ctx => {
      try {
        await exec.command('pm2 reload all')
        ctx.body = { status: 'ok', message: 'Server restarted' }
      } catch (error) {
        console.error('Failed to restart', error)
        ctx.status = 500
        ctx.body = { status: 'error', message: 'Failed to restart server' }
      }
    },

    restartWithBody: async ctx => {
      // SAFETY: @koa/bodyparser augments the Koa request with a parsed JSON body.
      const { name, pass } = (ctx.request as BodyRequest).body ?? {}

      if (!safeCompare(name, 'bundlephobia') || !safeCompare(pass, password)) {
        console.error('Failed to restart: unauthorized')
        ctx.status = 401
        ctx.body = { status: 'error', message: 'Unauthorized' }

        return
      }

      try {
        const { stderr } = await exec.command('pm2 reload all')

        if (stderr) console.error(stderr)
        ctx.body = { status: 'ok', message: 'Server restarted' }
      } catch (error) {
        console.error('Failed to restart', error)
        ctx.status = 500
        ctx.body = { status: 'error', message: 'Failed to restart server' }
      }
    },

    clearCache: async ctx => {
      try {
        await removePaths([
          '/tmp/tmp-build/cache/_cacache',
          '/tmp/tmp-build/packages/',
        ])

        ctx.body = { status: 'ok', message: 'Cache cleared' }
      } catch (error) {
        console.error('Failed to clear cache', error)
        ctx.status = 500
        ctx.body = { status: 'error', message: 'Failed to clear cache' }
      }
    },
  }
}
