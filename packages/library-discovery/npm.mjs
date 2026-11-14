import gitUrlParse from 'git-url-parse'

export function supportsBrowser(manifest) {
  return (
    Boolean(manifest.browser) ||
    /"browser"\s*:/.test(JSON.stringify(manifest.exports ?? {})) ||
    /\b(?:browser|isomorphic|front[ -]?end)\b/i.test(
      (manifest.keywords ?? []).join(' '),
    )
  )
}

const DAY = 86_400_000

export function downloadSignals(downloads) {
  if (
    !Array.isArray(downloads) ||
    downloads.length !== 56 ||
    downloads.some(day => !Number.isFinite(day.downloads) || day.downloads < 0)
  )
    throw new Error('Expected 56 complete daily download observations')
  const firstDay = Date.parse(downloads[0].day)

  if (
    !Number.isFinite(firstDay) ||
    downloads.some(
      (day, i) =>
        day.day !== new Date(firstDay + i * DAY).toISOString().slice(0, 10),
    )
  )
    throw new Error('Download observations must be consecutive daily values')

  const previous28Days = downloads
    .slice(0, 28)
    .reduce((sum, day) => sum + day.downloads, 0)

  const last28Days = downloads
    .slice(28)
    .reduce((sum, day) => sum + day.downloads, 0)

  return {
    previous28Days,
    last28Days,
    weeklyDownloads: Math.floor(last28Days / 4),
    downloadGrowth: previous28Days ? last28Days / previous28Days - 1 : null,
  }
}

export function eligibleCandidates(observations, known, minimumOwners) {
  const packages = Map.groupBy(
    observations.filter(item => !known.has(item.package)),
    item => item.package,
  )

  return Array.from(packages, ([name, declarations]) => {
    const repositories = Map.groupBy(declarations, item => item.repo)

    const consumers = Array.from(
      repositories.values(),
      declarations =>
        declarations.findLast(item => item.runtime) ?? declarations[0],
    )

    return {
      package: name,
      consumers,
      ownerCount: new Set(consumers.map(item => item.owner)).size,
      runtimeOwnerCount: new Set(
        consumers
          .values()
          .filter(item => item.runtime)
          .map(item => item.owner),
      ).size,
    }
  })
    .filter(candidate => candidate.ownerCount >= minimumOwners)
    .sort(
      (a, b) =>
        b.runtimeOwnerCount - a.runtimeOwnerCount ||
        b.ownerCount - a.ownerCount ||
        a.package.localeCompare(b.package),
    )
}

export function selectCandidates(qualified, limit) {
  const ranked = qualified.toSorted(
    (a, b) =>
      (b.downloadGrowth ?? 0) - (a.downloadGrowth ?? 0) ||
      b.weeklyDownloads - a.weeklyDownloads ||
      a.package.localeCompare(b.package),
  )

  const libraries = Map.groupBy(
    ranked,
    candidate => candidate.upstream ?? candidate.package,
  )

  return Array.from(libraries.values(), packages => packages[0]).slice(0, limit)
}

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
