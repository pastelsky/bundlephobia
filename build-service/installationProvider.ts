import {
  BuildCancelledError,
  InstallError,
  PackageNotFoundError,
} from 'package-build-stats'
import { z } from 'zod'

const serviceErrorSchema = z.object({
  name: z.string().optional(),
  originalError: z.unknown(),
  extra: z.record(z.string(), z.unknown()).optional(),
})

const installationSchema = z.object({
  packageString: z.string(),
  packageName: z.string(),
  installPath: z.string(),
  packagePath: z.string(),
  subscriptionId: z.string(),
})

interface InstallationRequestOptions {
  client?: string | string[]
  limitConcurrency?: boolean
  networkConcurrency?: number
  additionalPackages?: string[]
  installTimeout?: number
  debug?: boolean
  signal?: AbortSignal
}

function serviceError(
  { name, originalError, extra }: z.infer<typeof serviceErrorSchema>,
  status: number,
) {
  if (status === 404 || name === 'PackageNotFoundError') {
    return new PackageNotFoundError(originalError, extra)
  }

  return new InstallError(originalError, {
    ...extra,
    retryable: status >= 500,
  })
}

async function requestInstallation(
  url: string,
  packageString: string,
  options: InstallationRequestOptions,
): Promise<Response> {
  try {
    return await fetch(`${url}/installations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        packageString,
        options: {
          client: options.client,
          limitConcurrency: options.limitConcurrency,
          networkConcurrency: options.networkConcurrency,
          additionalPackages: options.additionalPackages,
          installTimeout: options.installTimeout,
          debug: options.debug,
        },
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw new BuildCancelledError()
    throw new InstallError(error, { retryable: true })
  }
}

async function releaseInstallation(
  url: string,
  subscriptionId: string,
): Promise<void> {
  try {
    const result = await fetch(
      `${url}/installations/${encodeURIComponent(subscriptionId)}`,
      { method: 'DELETE' },
    )

    if (!result.ok) throw new Error(`Unexpected status ${result.status}`)
  } catch (error) {
    // The daemon expires abandoned leases; a failed release must not
    // replace a successful analysis or its original error.
    console.error('INSTALLATION_RELEASE_FAILED', { subscriptionId, error })
  }
}

export function createInstallationProvider(endpoint: string) {
  const url = endpoint.replace(/\/$/, '')

  return async (packageString: string, options: InstallationRequestOptions) => {
    const response = await requestInstallation(url, packageString, options)

    let payload: unknown

    try {
      payload = await response.json()
    } catch (error) {
      throw new InstallError(error, { retryable: true })
    }

    if (!response.ok) {
      const parsedError = serviceErrorSchema.safeParse(payload)

      if (!parsedError.success) {
        throw new InstallError(
          'Installation service returned an invalid error',
          { retryable: true },
        )
      }

      throw serviceError(parsedError.data, response.status)
    }

    const parsed = installationSchema.safeParse(payload)

    if (!parsed.success) {
      throw new InstallError(
        'Installation service returned an invalid response',
        {
          retryable: true,
        },
      )
    }

    const { subscriptionId, ...installation } = parsed.data

    return {
      ...installation,
      async release() {
        await releaseInstallation(url, subscriptionId)
      },
    }
  }
}
