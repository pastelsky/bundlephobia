export function eligibleCandidates(observations, known, minimumOwners) {
  const packages = new Map()

  for (const observation of observations) {
    if (known.has(observation.package)) continue

    if (!packages.has(observation.package))
      packages.set(observation.package, new Map())
    const consumers = packages.get(observation.package)
    const previous = consumers.get(observation.repo)

    if (!previous || observation.runtime)
      consumers.set(observation.repo, observation)
  }

  const eligible = packages
    .entries()
    .map(([name, consumerMap]) => {
      const consumers = [...consumerMap.values()]
      const owners = new Set(consumers.map(consumer => consumer.owner))

      const runtimeOwners = new Set(
        consumers
          .values()
          .filter(consumer => consumer.runtime)
          .map(consumer => consumer.owner),
      )

      return {
        package: name,
        consumers,
        ownerCount: owners.size,
        runtimeOwnerCount: runtimeOwners.size,
      }
    })
    .filter(candidate => candidate.ownerCount >= minimumOwners)
    .toArray()
    .sort(
      (a, b) =>
        b.runtimeOwnerCount - a.runtimeOwnerCount ||
        b.ownerCount - a.ownerCount ||
        a.package.localeCompare(b.package),
    )

  return eligible
}

export function selectCandidates(qualified, limit) {
  qualified.sort(
    (a, b) =>
      (b.downloadGrowth ?? 0) - (a.downloadGrowth ?? 0) ||
      b.weeklyDownloads - a.weeklyDownloads ||
      a.package.localeCompare(b.package),
  )
  const candidates = []
  const upstreams = new Set()

  for (const candidate of qualified) {
    const upstream = candidate.upstream ?? candidate.package

    if (upstreams.has(upstream)) continue
    upstreams.add(upstream)
    candidates.push(candidate)

    if (candidates.length >= limit) break
  }

  return candidates
}
