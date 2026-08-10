type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const store = new Map<string, CacheEntry<unknown>>()

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) {
    return undefined
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}
