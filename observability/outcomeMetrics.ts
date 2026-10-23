import { Counter, Registry } from 'prom-client'

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

  async function measure<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await run()
      record(operation, 'success')

      return result
    } catch (error) {
      record(operation, 'failure')
      throw error
    }
  }

  return { registry, record, measure }
}
