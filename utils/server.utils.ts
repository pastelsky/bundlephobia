import 'dotenv-defaults/config'

import type { Context } from 'koa'

import CustomError from '../server/CustomError'
import Queue from '../server/Queue'

interface PacoteModule {
  manifest(
    spec: string,
    options: { fullMetadata: boolean }
  ): Promise<ResolvedPackageManifest>
}

const pacote = require('pacote') as PacoteModule

interface PacoteManifestError {
  code?: string
  distTags?: Record<string, string>
  versions?: string[]
}

export interface ResolvedPackageManifest {
  name: string
  version: string
  description?: string
  repository?: string | { url?: string }
  [key: string]: unknown
}

export async function resolvePackage(
  packageString: string
): Promise<ResolvedPackageManifest> {
  try {
    const manifest = await pacote.manifest(packageString, {
      fullMetadata: true,
    })
    return manifest as ResolvedPackageManifest
  } catch (error) {
    const pacoteError = error as PacoteManifestError

    if (pacoteError.code === 'ETARGET') {
      throw new CustomError('PackageVersionMismatchError', null, {
        validVersions: [
          ...Object.keys(pacoteError.distTags ?? {}),
          ...(pacoteError.versions ?? []),
        ],
      })
    }

    throw new CustomError('PackageNotFoundError', error, undefined)
  }
}

export function getRequestPriority(ctx: Context): number {
  const client = ctx.headers['x-bundlephobia-user']

  switch (client) {
    case 'bundlephobia website':
      return Queue.priority.HIGH
    case 'yarn website':
      return Queue.priority.LOW
    default:
      return Queue.priority.MEDIUM
  }
}
