export const numberFormat = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
})

export const compactFormat = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatBytes(value: number) {
  if (value >= 1073741824)
    return `${numberFormat.format(value / 1073741824)} GiB`

  if (value >= 1048576) return `${numberFormat.format(value / 1048576)} MiB`

  if (value >= 1024) return `${numberFormat.format(value / 1024)} KiB`

  return `${numberFormat.format(value)} B`
}

export const STATUS_LABELS = new Map([
  ['1xx', 'Informational'],
  ['2xx', 'Success'],
  ['3xx', 'Redirects'],
  ['4xx', 'Client errors'],
  ['5xx', 'Server errors'],
  ['other', 'Other'],
])
