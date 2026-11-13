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
