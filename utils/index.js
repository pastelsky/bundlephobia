// Firebase does not accept a
// few special characters for keys
function encodeFirebaseKey(key) {
  return key
    .replace(/[.]/g, ',')
    .replace(/\//g, '__')
}

function decodeFirebaseKey(key) {
  return key
    .replace(/[,]/g, '.')
    .replace(/__/g, '/')
}

const formatSize = (value) => {
  let unit, size
  if (Math.log10(value) < 3) {
    unit = 'B'
    size = value
  } else if (Math.log10(value) < 6) {
    unit = 'kB'
    size = value / 1024
  } else {
    unit = 'mB'
    size = value / 1024 / 1024
  }

  return { unit, size }
}

const formatTime = (value) => {
  let unit, size
  if (value < 0.5) {
    unit = 'ms'
    size = Math.round(value * 1000)
  } else {
    unit = 's'
    size = value
  }

  return { unit, size }
}

module.exports = {
  encodeFirebaseKey,
  decodeFirebaseKey,
  formatTime,
  formatSize,
}