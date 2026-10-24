import { Counter, type Registry } from 'prom-client'
import { z } from 'zod'
import { BUILD_FAILURE_CODES } from '@bundlephobia/service-contracts/build-metrics'
import type { OutcomeError } from '../server/infrastructure/outcome-metrics.mts'

const failureCode = z.enum(BUILD_FAILURE_CODES).catch('UnknownError')

export function createBuildFailureRecorder(registry: Registry) {
  const failures = new Counter({
    name: 'bundlephobia_build_failures_total',
    help: 'Failed terminal build attempts grouped by the SDK error code.',
    labelNames: ['operation', 'code'],
    registers: [registry],
  })

  return (operation: string, error: OutcomeError) => {
    // SDK error names identify build failures. A bounded fallback prevents
    // unexpected error names from creating unlimited series.
    failures.inc({ operation, code: failureCode.parse(error?.name) })
  }
}
