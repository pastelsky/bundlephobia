import type { FailureCacheEntry } from './types'

const HOUR_MS = 60 * 60 * 1000

const DAY_MS = 24 * HOUR_MS

const FAILURE_COOLDOWNS_MS = [
  HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  3 * DAY_MS,
  3 * DAY_MS,
] as const

export function getFailureCooldownMs(consecutiveFailures: number): number {
  if (consecutiveFailures < 2) return 0

  const index = Math.min(
    consecutiveFailures - 2,
    FAILURE_COOLDOWNS_MS.length - 1,
  )

  return FAILURE_COOLDOWNS_MS[index]
}

export function recordFailure(
  previous: FailureCacheEntry | undefined,
  failure: Pick<FailureCacheEntry, 'status' | 'body'>,
  recordedAt = Date.now(),
): FailureCacheEntry {
  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1
  const cooldownMs = getFailureCooldownMs(consecutiveFailures)

  return {
    status: failure.status,
    body: failure.body,
    consecutiveFailures,
    blockedUntil:
      cooldownMs > 0 ? recordedAt + cooldownMs : previous?.blockedUntil,
  }
}

export function isFailureBlocked(
  entry: FailureCacheEntry | undefined,
  now = Date.now(),
): entry is FailureCacheEntry & { blockedUntil: number } {
  return entry?.blockedUntil !== undefined && entry.blockedUntil > now
}
