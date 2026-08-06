const POTATO_QUERY = 'potato'

export const isPotatoQuery = (value: string) =>
  value.trim().toLowerCase() === POTATO_QUERY
