/** The slice of AbortSignal a build needs to cancel on client disconnect. */
export interface BuildAbortSignal {
  readonly aborted: boolean
  addEventListener(
    type: 'abort',
    listener: () => void,
    options: { once: true }
  ): void
  removeEventListener(type: 'abort', listener: () => void): void
}

interface CancellableBuild<T> {
  run(): Promise<T>
  cancel(): void
  signal?: BuildAbortSignal
}

/**
 * Runs a build, wiring the abort signal to `cancel` so a client that hangs up
 * stops the underlying build job instead of leaking it. If the signal is
 * already aborted, the build never starts.
 */
export async function runCancellableBuild<T>({
  run,
  cancel,
  signal,
}: CancellableBuild<T>): Promise<T> {
  if (signal?.aborted) {
    cancel()
    throw new Error('Build aborted before it started')
  }

  signal?.addEventListener('abort', cancel, { once: true })
  try {
    return await run()
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}
