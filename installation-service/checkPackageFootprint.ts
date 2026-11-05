import pacote from 'pacote'
import { z } from 'zod'

const MAX_UNPACKED_BYTES = 200 * 1024 * 1024

const MAX_FILES = 50_000

const publishedCount = z.number().int().nonnegative().catch(0).default(0)

const footprintSchema = z.object({
  dist: z
    .object({ unpackedSize: publishedCount, fileCount: publishedCount })
    .catch({ unpackedSize: 0, fileCount: 0 })
    .default({ unpackedSize: 0, fileCount: 0 }),
})

class PackageFootprintError extends Error {
  override name = 'UnsupportedPackageError'

  toJSON() {
    return {
      name: this.name,
      originalError: this.cause,
      extra: { reason: this.message },
    }
  }
}

// These npm-generated fields describe the root archive, not its dependencies.
// Older publications can lack them; missing metadata is not evidence of abuse.
export async function checkPackageFootprint(
  packageString: string,
  signal?: AbortSignal,
  manifest: typeof pacote.manifest = pacote.manifest,
): Promise<void> {
  signal?.throwIfAborted()

  const registryOptions = {
    fullMetadata: false,
    preferOffline: true,
    fetchRetries: 0,
    timeout: 10_000,
  }

  const metadata = await manifest(packageString, registryOptions)

  signal?.throwIfAborted()

  const { dist } = footprintSchema.parse(metadata)

  const exceedsSize = dist.unpackedSize > MAX_UNPACKED_BYTES

  const exceedsFiles = dist.fileCount > MAX_FILES

  if (!exceedsSize && !exceedsFiles) return

  throw new PackageFootprintError(
    'the published package exceeds the installation limit of 200 MiB or 50,000 files',
    { cause: packageString },
  )
}
