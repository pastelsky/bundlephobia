import auth from 'koa-basic-auth'
import Router from '@koa/router'

import { createAdminController } from '../controllers/admin.controller'

export function registerAdminRoutes(router: Router, password: string): void {
  const controller = createAdminController(password)
  const credentials = auth({ name: 'bundlephobia', pass: password })

  router.get('/admin/restart', credentials, controller.restart)
  router.post('/admin/restart', controller.restartWithBody)
  router.get('/admin/clear-cache', credentials, controller.clearCache)
}
