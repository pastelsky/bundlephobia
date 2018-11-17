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


// Picked up from http://www.webpagetest.org/
// Speed in KB/s

const DownloadSpeed = {
  TWO_G: 30,     // 2G Edge
  THREE_G: 50    // Emerging markets 3G
}
const getTimeFromSize = (sizeInBytes) => {
  return {
    twoG: sizeInBytes / 1024 / DownloadSpeed.TWO_G,
    threeG: sizeInBytes / 1024 / DownloadSpeed.THREE_G,
  }
}

module.exports = {
  encodeFirebaseKey,
  decodeFirebaseKey,
  formatTime,
  formatSize,
  getTimeFromSize,
  DownloadSpeed,
}