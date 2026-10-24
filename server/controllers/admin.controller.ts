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

export function createAdminController(password: string): AdminController {
  return {
    restart: async ctx => {
      try {
        const { stdout } = await exec.command('pm2 reload all')
        ctx.body = 'Server restarted' + stdout
      } catch (error) {
        console.error('Failed to restart', error)
        ctx.status = 500
        ctx.body = error
      }
    },

    restartWithBody: async ctx => {
      // SAFETY: koa-bodyparser augments the Koa request with a parsed JSON body.
      const { name, pass } = (ctx.request as BodyRequest).body ?? {}

      if (name !== 'bundlephobia' || pass !== password) {
        console.error('Failed to restart')
        ctx.status = 500
        ctx.body = 'Failed to restart'
      } else {
        const { stdout, stderr } = await exec.command('pm2 reload all')
        ctx.body = 'Server restarted' + stdout
        console.error(stderr)
      }
    },

    clearCache: async ctx => {
      try {
        await removePaths([
          '/tmp/tmp-build/cache/_cacache',
          '/tmp/tmp-build/packages/',
        ])

        ctx.body = 'Cache cleared'
      } catch (error) {
        console.error('Failed to clear cache', error)
        ctx.status = 500
        ctx.body = error
      }
    },
  }
}
