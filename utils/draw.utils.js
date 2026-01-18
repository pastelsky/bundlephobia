const fabric = require('fabric/node')
const { formatSize, formatTime, getTimeFromSize } = require('./index')

function drawStatsImg({
  name,
  version,
  min,
  gzip,
  theme = 'dark',
  wide = false,
}) {
  const lightTheme = {
    backgroundColor: '#fff',
    separatorColor: '#E7E7E7',
    separatorOpacity: 1,
    nameColor: '#000',
    versionColor: '#979797',
    versionOpacity: 1,
    numberColor: '#333',
    numberOpacity: 1,
    unitColor: '#7D828C',
    unitOpacity: 1,
    labelColor: '#54575C',
    labelOpacity: 1,
  }

  const darkTheme = {
    backgroundColor: '#182330',
    separatorColor: '#fff',
    separatorOpacity: 0.12,
    nameColor: '#fff',
    versionColor: '#fff',
    versionOpacity: 0.6,
    numberColor: '#fff',
    numberOpacity: 0.8,
    unitColor: '#E5EEFF',
    unitOpacity: 0.5,
    labelColor: '#fff',
    labelOpacity: 0.55,
  }

  const width = 624
  const height = 350
  const pad = 5
  const wideBy = 25

  const selectedTheme = theme === 'light' ? lightTheme : darkTheme

  const canvas = new fabric.StaticCanvas('c', {
    backgroundColor: selectedTheme.backgroundColor,
    width: wide ? width + wideBy : width,
    height: height,
  })

  // Set export scaling
  canvas.enableRetinaScaling = true
  canvas.setDimensions(
    { width: canvas.width * 1.5, height: canvas.height * 1.5 },
    { cssOnly: true }
  )

  const x0 = wide ? wideBy / 2 : 0

  const separatorOptions = {
    stroke: selectedTheme.separatorColor,
    strokeWidth: 0.5,
    opacity: selectedTheme.separatorOpacity,
  }

  const lineTopHorizontal = new fabric.Line(
    [x0, 91, width, 91],
    separatorOptions
  )
  const lineCenterVertical = new fabric.Line(
    [width / 2, 91, width / 2, height],
    separatorOptions
  )
  const lineCenterHorizontal = new fabric.Line(
    [x0, 91 + (height - 91) / 2, width, 91 + (height - 91) / 2],
    separatorOptions
  )

  const packageNameText = new fabric.Text(name, {
    fontFamily: 'Source Code Pro',
    fontSize: 45,
    fill: selectedTheme.nameColor,
    opacity: 0.8,
    top: 19,
  })

  const packageAtText = new fabric.Text('@', {
    fontFamily: 'Source Code Pro',
    fontSize: 35,
    fill: '#91D396',
    left: packageNameText.width + pad * 2,
    top: 24,
  })

  const packageVersionText = new fabric.Text(version, {
    fontFamily: 'Source Code Pro',
    fontSize: 35,
    fill: selectedTheme.versionColor,
    opacity: selectedTheme.versionOpacity,
    left: packageNameText.width + packageAtText.width + +pad * 4,
    top: 28,
  })

  const packageNameGroup = new fabric.Group(
    [packageNameText, packageAtText, packageVersionText],
    { selectable: false }
  )

  function createStatGroup(number, unit, label, opts) {
    const numberText = new fabric.Text(number.toString(), {
      fontFamily: 'SF Compact Text',
      fontSize: 55,
      fill: selectedTheme.numberColor,
      fontWeight: 'bold',
      opacity: selectedTheme.numberOpacity,
    })

    const unitText = new fabric.Text(unit, {
      fontFamily: 'SF Compact Text',
      fontSize: 35,
      fill: selectedTheme.unitColor,
      fontWeight: 'bold',
      opacity: selectedTheme.unitOpacity,
      left: numberText.width + pad / 2,
    })

    unitText.top = numberText.top + numberText.height - unitText.height - pad

    const labelText = new fabric.Text(label, {
      fontFamily: 'SF Compact Text',
      fontSize: 25,
      fontWeight: 100,
      fill: selectedTheme.labelColor,
      opacity: selectedTheme.labelOpacity,
      top: numberText.height,
      left: (numberText.width + unitText.width) / 2,
      originX: 'center',
    })

    return new fabric.Group([numberText, unitText, labelText], opts)
  }

  const minSize = formatSize(min)
  const gzipSize = formatSize(gzip)
  const times = getTimeFromSize(gzip)
  const threeGTime = formatTime(times.threeG)
  const fourGTime = formatTime(times.fourG)

  const minGroup = createStatGroup(
    minSize.size.toFixed(2),
    minSize.unit,
    'minified',
    {
      originX: 'center',
      top: 106,
      left: width / 4,
    }
  )

  const gzipGroup = createStatGroup(
    gzipSize.size.toFixed(2),
    gzipSize.unit,
    'gzipped',
    {
      originX: 'center',
      top: 106,
      left: width * (3 / 4),
    }
  )

  const threeGGroup = createStatGroup(
    threeGTime.unit === 'ms' ? threeGTime.size : threeGTime.size.toFixed(1),
    threeGTime.unit,
    'slow 3G',
    {
      originX: 'center',
      top: 235,
      left: width / 4,
    }
  )

  const fourGGroup = createStatGroup(
    fourGTime.unit === 'ms' ? fourGTime.size : fourGTime.size.toFixed(1),
    fourGTime.unit,
    'emerging 4G',
    {
      originX: 'center',
      top: 235,
      left: width * (3 / 4),
    }
  )

  canvas
    .add(lineTopHorizontal)
    .add(lineCenterVertical)
    .add(lineCenterHorizontal)
    .add(packageNameGroup)
    .add(minGroup)
    .add(gzipGroup)
    .add(threeGGroup)
    .add(fourGGroup)

  canvas.centerObjectH(packageNameGroup)
  canvas.renderAll()
  return canvas.createJPEGStream()
}

module.exports = { drawStatsImg }
