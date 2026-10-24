import type { eventQueue } from 'package-build-stats'
import { z } from 'zod'
import { Counter, Registry } from 'prom-client'

const outcomeEvent = z.object({ isSuccessful: z.boolean() })

// Only bounded operation/outcome labels: package names and error messages would
// grow the database with every package. Default Node metrics are intentionally off.
export function createOutcomeMetrics(name: string, operations: string[]) {
  const registry = new Registry()

  const completed = new Counter({
    name,
    help: 'Completed attempts, excluding cache hits and work killed before completion.',
    labelNames: ['operation', 'outcome'],
    registers: [registry],
  })

  for (const operation of operations) {
    for (const outcome of ['success', 'failure']) {
      completed.inc({ operation, outcome }, 0)
    }
  }

  function record(operation: string, outcome: 'success' | 'failure') {
    completed.inc({ operation, outcome })
  }

  // Library events carry arbitrary details; only the completion flag crosses
  // into metrics. Event names and operation labels come from static wiring.
  function observe(
    queue: typeof eventQueue,
    operationsByEvent: Record<string, string>,
  ) {
    for (const [event, operation] of Object.entries(operationsByEvent)) {
      queue.on(event, details => {
        const parsed = outcomeEvent.safeParse(details)

        if (parsed.success)
          record(operation, parsed.data.isSuccessful ? 'success' : 'failure')
      })
    }
  }

  return { registry, record, observe }
}
