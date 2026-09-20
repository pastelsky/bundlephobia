export function encodeFirebaseKey(key: string) {
  return key.replace(/[.]/g, ',').replace(/\//g, '__')
}
