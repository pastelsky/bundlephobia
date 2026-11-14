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
