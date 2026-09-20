import {
  getFailureCooldownMs,
  isFailureBlocked,
  recordFailure,
} from '../server/failure-backoff'

const failure = { status: 422, body: { error: { code: 'BuildError' } } }

describe('failure backoff', () => {
  it('allows the first failure and expands cooldowns after that', () => {
    const first = recordFailure(undefined, failure, 1_000)
    const second = recordFailure(first, failure, 2_000)
    const third = recordFailure(second, failure, 3_000)

    expect(first.consecutiveFailures).toBe(1)
    expect(first.blockedUntil).toBeUndefined()
    expect(second.blockedUntil).toBe(2_000 + 15 * 60 * 1000)
    expect(third.blockedUntil).toBe(3_000 + 60 * 60 * 1000)
  })

  it('caps the cooldown at three days', () => {
    expect(getFailureCooldownMs(7)).toBe(3 * 24 * 60 * 60 * 1000)
    expect(getFailureCooldownMs(100)).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('recognizes only active cooldowns as blocked', () => {
    const entry = recordFailure(
      recordFailure(undefined, failure, 1_000),
      failure,
      2_000,
    )

    const blockedUntil = entry.blockedUntil ?? 0

    expect(isFailureBlocked(entry, blockedUntil - 1)).toBe(true)
    expect(isFailureBlocked(entry, blockedUntil)).toBe(false)
  })
})
