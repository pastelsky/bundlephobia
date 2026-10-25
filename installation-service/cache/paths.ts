import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const buildRoot = path.resolve(
  process.env.BUILD_TMP_DIR || '/tmp/tmp-build',
)

export const cacheRoot = path.join(buildRoot, 'cache/bun')

export const stateRoot =
  process.env.BUN_CACHE_STATE_DIR || '/var/lib/bundlephobia-cache-policy'

export const policyFile =
  process.env.BUN_CACHE_POLICY_FILE ||
  fileURLToPath(new URL('../../operations/cache/bun-policy', import.meta.url))

export const segmentBytes = 8 * 1024 * 1024

export const usageFiles = ['usage.previous.jsonl', 'usage.current.jsonl']

export const lockFile =
  process.env.BUN_CACHE_LOCK_FILE || '/run/lock/bundlephobia-bun-cache.lock'

export function isReusePolicyEnabled(): boolean {
  try {
    return readFileSync(policyFile, 'utf8').trim() === 'reuse'
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false

    throw error
  }
}

export function createPackageManagerCommand(enabled: boolean) {
  if (!enabled) return undefined

  return (command: string, args: readonly string[]) =>
    process.platform === 'linux' && command === 'bun'
      ? { command: 'flock', args: ['--shared', lockFile, command, ...args] }
      : { command, args: [...args] }
}
