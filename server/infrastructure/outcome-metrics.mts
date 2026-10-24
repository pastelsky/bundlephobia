import type { eventQueue } from 'package-build-stats'
import { z } from 'zod'
import { Counter, Histogram, Registry } from 'prom-client'

const outcomeEvent = z.object({
  isSuccessful: z.boolean(),
  duration: z.number().finite().nonnegative().optional(),
})

// Only bounded operation/outcome labels: package names and error messages would
// grow the database with every package. Default Node metrics are intentionally off.
export function createOutcomeMetrics(
  name: string,
  operations: string[],
  durationName: string,
) {
  const registry = new Registry()

  const completed = new Counter({
    name,
    help: 'Completed attempts, excluding cache hits and work killed before completion.',
    labelNames: ['operation', 'outcome'],
    registers: [registry],
  })

  const duration = new Histogram({
    name: durationName,
    help: 'Duration of completed uncached attempts in seconds, excluding killed work.',
    labelNames: ['operation'],
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60, 120, 300, 600],
    registers: [registry],
  })

  for (const operation of operations) {
    duration.zero({ operation })

    for (const outcome of ['success', 'failure']) {
      completed.inc({ operation, outcome }, 0)
    }
  }

  function record(
    operation: string,
    outcome: 'success' | 'failure',
    seconds?: number,
  ) {
    completed.inc({ operation, outcome })

    if (seconds != null) duration.observe({ operation }, seconds)
  }

  // Library events carry arbitrary details; validate only outcome and duration
  // before recording bounded metrics. Event names and operation labels come
  // from static wiring.
  function observe(
    queue: typeof eventQueue,
    operationsByEvent: Record<string, string>,
  ) {
    for (const [event, operation] of Object.entries(operationsByEvent)) {
      queue.on(event, details => {
        const parsed = outcomeEvent.safeParse(details)

        if (parsed.success)
          record(
            operation,
            parsed.data.isSuccessful ? 'success' : 'failure',
            parsed.data.duration == null
              ? undefined
              : parsed.data.duration / 1000,
          )
      })
    }
  }

  return { registry, record, observe }
}
