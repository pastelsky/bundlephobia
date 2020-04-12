function encodeFirebaseKey(key) {
  return key.replace(/[.]/g, ',').replace(/\//g, '__')
}

module.exports = { encodeFirebaseKey }
