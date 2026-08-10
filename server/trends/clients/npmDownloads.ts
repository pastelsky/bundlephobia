import { npmDownloadsClient } from './http'

export type NpmDownloadPoint = { day: string; downloads: number }

type NpmRangeResponse = { downloads: NpmDownloadPoint[] }

function encodePackageName(packageName: string) {
  return packageName
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
}

export async function fetchNpmDownloadRange(
  packageName: string,
  range: string
) {
  const { data } = await npmDownloadsClient.get<NpmRangeResponse>(
    `/downloads/range/${range}/${encodePackageName(packageName)}`
  )
  return data.downloads || []
}
