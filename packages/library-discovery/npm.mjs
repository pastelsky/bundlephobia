import gitUrlParse from 'git-url-parse'
import { supportsBrowser } from './dependencies.mjs'
import { downloadSignals } from './downloads.mjs'

function repositoryDetails(manifest) {
  try {
    const repository = manifest.repository?.url ?? manifest.repository

    const parsed = gitUrlParse(repository)

    return {
      owner:
        parsed.resource === 'github.com' ? parsed.owner.toLowerCase() : null,
      key: `${parsed.resource}/${parsed.full_name}`,
    }
  } catch {
    return { owner: null, key: null }
  }
}

async function qualifyCandidate(registry, candidate, options) {
  const name = encodeURIComponent(candidate.package)
  const manifest = await registry(`https://registry.npmjs.org/${name}/latest`)

  if (manifest.name !== candidate.package || manifest.deprecated) return null
  const upstream = repositoryDetails(manifest)

  const consumers = candidate.consumers.filter(
    consumer => consumer.owner !== upstream.owner,
  )

  if (
    new Set(consumers.map(consumer => consumer.owner)).size <
    options.minimumOwners
  )
    return null

  const runtimeConsumers = consumers.filter(consumer => consumer.runtime)
  const browserSupportHint = supportsBrowser(manifest)

  // A devDependency may still be bundled, but metadata is only a lead for the researcher.
  if (!runtimeConsumers.length && !browserSupportHint) return null

  const result = await registry(
    `https://api.npmjs.org/downloads/range/${options.downloadStart}:${options.downloadEnd}/${name}`,
  )

  const signals = downloadSignals(result.downloads)

  if (
    result.downloads[0].day !== options.downloadStart ||
    result.downloads.at(-1).day !== options.downloadEnd
  )
    throw new Error('npm returned a different download window')

  if (signals.weeklyDownloads < options.minimumWeeklyDownloads) return null

  return {
    package: candidate.package,
    upstream: upstream.key,
    repository: manifest.repository?.url ?? manifest.repository ?? null,
    description: manifest.description ?? '',
    version: manifest.version,
    consumers,
    runtimeConsumerCount: runtimeConsumers.length,
    browserSupportHint,
    ...signals,
  }
}

export async function checkNpmCandidates(registry, eligible, options, notes) {
  if (eligible.length > options.metadata)
    notes.push(
      `npm metadata budget reached (${options.metadata}/${eligible.length} packages)`,
    )
  const qualified = []
  let packagesCheckedOnNpm = 0

  for (const candidate of eligible.slice(0, options.metadata)) {
    try {
      packagesCheckedOnNpm++
      const result = await qualifyCandidate(registry, candidate, options)

      if (result) qualified.push(result)
    } catch (error) {
      notes.push(
        `npm evidence unavailable: ${candidate.package}: ${error.message}`,
      )

      if (error.status === 429) {
        notes.push(
          'npm rate limit exhausted; remaining packages deferred without marking them surfaced',
        )
        break
      }
    }
  }

  return { qualified, packagesCheckedOnNpm }
}
