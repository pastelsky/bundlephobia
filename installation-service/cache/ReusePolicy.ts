type QueueName = 'small' | 'main' | 'ghost'

/** Cheap reuse ranking, independent of installation leases and physical space. */
export default class ReusePolicy {
  readonly small = new Map<string, number>()
  readonly main = new Map<string, number>()
  readonly ghost = new Set<string>()
  private heads: Record<QueueName, Iterator<string, undefined>> = {
    small: this.small.keys(),
    main: this.main.keys(),
    ghost: this.ghost.keys(),
  }

  readonly capacity: number
  private readonly smallTarget: number
  private readonly ghostCapacity: number

  constructor(capacity = 100_000, workingSet = capacity) {
    this.capacity = capacity
    this.smallTarget = Math.max(1, Math.floor(workingSet / 10))
    this.ghostCapacity = Math.floor(workingSet * 0.9)
  }

  observe(key: string, demand = true) {
    const queue = this.residentQueue(key)
    const frequency = queue.get(key)

    if (frequency !== undefined) {
      if (demand) queue.set(key, Math.min(3, frequency + 1))

      return
    }

    if (this.small.size + this.main.size >= this.capacity) {
      throw new Error('Cache policy metadata capacity exceeded')
    }

    const recalled = this.ghost.delete(key)

    if (demand && recalled) this.main.set(key, 0)
    else this.small.set(key, demand ? 1 : 0)
  }

  forget(key: string) {
    this.small.delete(key)
    this.main.delete(key)
  }

  private residentQueue(key: string) {
    return this.small.has(key) ? this.small : this.main
  }

  private evictSmallNext() {
    return this.small.size >= this.smallTarget || this.main.size === 0
  }

  victim(): string | undefined {
    while (this.small.size + this.main.size > 0) {
      const fromSmall = this.evictSmallNext()
      const queue = fromSmall ? this.small : this.main
      const key = this.oldest(fromSmall ? 'small' : 'main')
      const frequency = queue.get(key)!
      queue.delete(key)

      // Each demand is a distinct materialization, with aliases deduplicated.
      // A second use is enough to protect a dependency shared across root installs.
      if (fromSmall && frequency >= 2) {
        this.main.set(key, 0)
      } else if (!fromSmall && frequency > 0) {
        this.main.set(key, frequency - 1)
      } else {
        return this.rememberVictim(key, fromSmall)
      }
    }

    return undefined
  }

  private rememberVictim(key: string, fromSmall: boolean) {
    // Ghost history remembers versions evicted before repeated reuse.
    if (fromSmall) {
      this.ghost.add(key)

      if (this.ghost.size > this.ghostCapacity) {
        this.ghost.delete(this.oldest('ghost'))
      }
    }

    return key
  }

  private oldest(queue: QueueName): string {
    let head = this.heads[queue].next()

    if (head.done) {
      this.heads[queue] = this[queue].keys()
      head = this.heads[queue].next()
    }

    return head.value!
  }

  snapshot() {
    return {
      small: [...this.small],
      main: [...this.main],
      ghost: [...this.ghost],
    }
  }

  restore(state: ReturnType<ReusePolicy['snapshot']>) {
    if (
      state.small.length + state.main.length > this.capacity ||
      state.ghost.length > this.capacity
    ) {
      throw new Error('Cache policy snapshot exceeds metadata capacity')
    }

    this.small.clear()
    this.main.clear()
    this.ghost.clear()

    for (const [key, frequency] of state.small) this.small.set(key, frequency)

    for (const [key, frequency] of state.main) this.main.set(key, frequency)

    for (const key of state.ghost.slice(-this.ghostCapacity)) {
      if (this.ghostCapacity) this.ghost.add(key)
    }

    this.heads = {
      small: this.small.keys(),
      main: this.main.keys(),
      ghost: this.ghost.keys(),
    }
  }
}
