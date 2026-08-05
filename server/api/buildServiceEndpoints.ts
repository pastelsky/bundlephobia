export function getBuildServiceEndpoints() {
  return (
    process.env.BUILD_SERVICE_ENDPOINTS ||
    process.env.BUILD_SERVICE_ENDPOINT ||
    ''
  )
    .split(',')
    .map(endpoint => endpoint.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function hash(value: string) {
  let result = 2166136261
  for (const character of value) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function rankBuildServiceEndpoints(
  packageString: string,
  endpoints: string[]
) {
  return [...endpoints].sort((left, right) => {
    return (
      hash(`${packageString}\0${right}`) - hash(`${packageString}\0${left}`)
    )
  })
}
