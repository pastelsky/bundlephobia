import * as fabric from 'fabric/node'

import {
  formatSize,
  formatTime,
  getTimeFromSize,
  type FormattedValue,
} from './index'

type ThemeName = 'dark' | 'light'

interface DrawStatsImgOptions {
  name: string
  version: string
  min: number
  gzip: number
  theme?: ThemeName
  wide?: boolean
}

interface Theme {
  backgroundColor: string
  separatorColor: string
  separatorOpacity: number
  nameColor: string
  versionColor: string
  versionOpacity: number
  numberColor: string
  numberOpacity: number
  unitColor: string
  unitOpacity: number
  labelColor: string
  labelOpacity: number
}

interface StatGroupOptions {
  number: string | number
  unit: string
  label: string
  theme: Theme
  pad: number
  position: {
    originX: 'center'
    top: number
    left: number
  }
}

const lightTheme: Theme = {
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

const darkTheme: Theme = {
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

function createStatGroup({
  number,
  unit,
  label,
  theme,
  pad,
  position,
}: StatGroupOptions) {
  const numberText = new fabric.Text(number.toString(), {
    fontFamily: 'SF Compact Text',
    fontSize: 55,
    fill: theme.numberColor,
    fontWeight: 'bold',
    opacity: theme.numberOpacity,
  })

  const unitText = new fabric.Text(unit, {
    fontFamily: 'SF Compact Text',
    fontSize: 35,
    fill: theme.unitColor,
    fontWeight: 'bold',
    opacity: theme.unitOpacity,
    left: (numberText.width ?? 0) + pad / 2,
  })

  unitText.top =
    (numberText.top ?? 0) +
    (numberText.height ?? 0) -
    (unitText.height ?? 0) -
    pad

  const labelText = new fabric.Text(label, {
    fontFamily: 'SF Compact Text',
    fontSize: 25,
    fontWeight: 100,
    fill: theme.labelColor,
    opacity: theme.labelOpacity,
    top: numberText.height ?? 0,
    left: ((numberText.width ?? 0) + (unitText.width ?? 0)) / 2,
    originX: 'center',
  })

  return new fabric.Group([numberText, unitText, labelText], position)
}

const IMAGE_WIDTH = 624

const IMAGE_HEIGHT = 350

const IMAGE_PAD = 5

const IMAGE_WIDE_BY = 25

function createImageCanvas({
  theme,
  wide,
}: Pick<DrawStatsImgOptions, 'theme' | 'wide'>) {
  const selectedTheme = theme === 'light' ? lightTheme : darkTheme

  const canvas = new fabric.StaticCanvas('c', {
    backgroundColor: selectedTheme.backgroundColor,
    width: wide ? IMAGE_WIDTH + IMAGE_WIDE_BY : IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  })

  canvas.enableRetinaScaling = true
  canvas.setDimensions(
    {
      width: (canvas.width ?? IMAGE_WIDTH) * 1.5,
      height: (canvas.height ?? IMAGE_HEIGHT) * 1.5,
    },
    { cssOnly: true },
  )

  return { canvas, selectedTheme }
}

function createSeparators({ theme, wide }: { theme: Theme; wide: boolean }) {
  const x0 = wide ? IMAGE_WIDE_BY / 2 : 0

  const options = {
    stroke: theme.separatorColor,
    strokeWidth: 0.5,
    opacity: theme.separatorOpacity,
  }

  return [
    new fabric.Line([x0, 91, IMAGE_WIDTH, 91], options),
    new fabric.Line(
      [IMAGE_WIDTH / 2, 91, IMAGE_WIDTH / 2, IMAGE_HEIGHT],
      options,
    ),
    new fabric.Line(
      [
        x0,
        91 + (IMAGE_HEIGHT - 91) / 2,
        IMAGE_WIDTH,
        91 + (IMAGE_HEIGHT - 91) / 2,
      ],
      options,
    ),
  ]
}

function createPackageNameGroup({
  name,
  version,
  theme,
}: {
  name: string
  version: string
  theme: Theme
}) {
  const packageNameText = new fabric.Text(name, {
    fontFamily: 'Source Code Pro',
    fontSize: 45,
    fill: theme.nameColor,
    opacity: 0.8,
    top: 19,
  })

  const packageAtText = new fabric.Text('@', {
    fontFamily: 'Source Code Pro',
    fontSize: 35,
    fill: '#91D396',
    left: (packageNameText.width ?? 0) + IMAGE_PAD * 2,
    top: 24,
  })

  const packageVersionText = new fabric.Text(version, {
    fontFamily: 'Source Code Pro',
    fontSize: 35,
    fill: theme.versionColor,
    opacity: theme.versionOpacity,
    left:
      (packageNameText.width ?? 0) + (packageAtText.width ?? 0) + IMAGE_PAD * 4,
    top: 28,
  })

  return new fabric.Group(
    [packageNameText, packageAtText, packageVersionText],
    { selectable: false },
  )
}

function formatStatValue(value: FormattedValue) {
  return value.unit === 'ms' ? value.size : value.size.toFixed(1)
}

function createStatGroups({
  min,
  gzip,
  theme,
}: {
  min: number
  gzip: number
  theme: Theme
}) {
  const minSize = formatSize(min)
  const gzipSize = formatSize(gzip)
  const times = getTimeFromSize(gzip)
  const threeGTime = formatTime(times.threeG)
  const fourGTime = formatTime(times.fourG)
  const common = { theme, pad: IMAGE_PAD }

  return [
    createStatGroup({
      ...common,
      number: minSize.size.toFixed(2),
      unit: minSize.unit,
      label: 'minified',
      position: { originX: 'center', top: 106, left: IMAGE_WIDTH / 4 },
    }),
    createStatGroup({
      ...common,
      number: gzipSize.size.toFixed(2),
      unit: gzipSize.unit,
      label: 'gzipped',
      position: { originX: 'center', top: 106, left: IMAGE_WIDTH * (3 / 4) },
    }),
    createStatGroup({
      ...common,
      number: formatStatValue(threeGTime),
      unit: threeGTime.unit,
      label: 'slow 3G',
      position: { originX: 'center', top: 235, left: IMAGE_WIDTH / 4 },
    }),
    createStatGroup({
      ...common,
      number: formatStatValue(fourGTime),
      unit: fourGTime.unit,
      label: 'emerging 4G',
      position: { originX: 'center', top: 235, left: IMAGE_WIDTH * (3 / 4) },
    }),
  ]
}

export function drawStatsImg({
  name,
  version,
  min,
  gzip,
  theme = 'dark',
  wide = false,
}: DrawStatsImgOptions) {
  const { canvas, selectedTheme } = createImageCanvas({ theme, wide })

  const [lineTopHorizontal, lineCenterVertical, lineCenterHorizontal] =
    createSeparators({ theme: selectedTheme, wide })

  const packageNameGroup = createPackageNameGroup({
    name,
    version,
    theme: selectedTheme,
  })

  const statGroups = createStatGroups({ min, gzip, theme: selectedTheme })

  canvas.add(lineTopHorizontal)
  canvas.add(lineCenterVertical)
  canvas.add(lineCenterHorizontal)
  canvas.add(packageNameGroup)
  statGroups.forEach(group => canvas.add(group))

  canvas.centerObjectH(packageNameGroup)
  canvas.renderAll()

  return canvas.createJPEGStream()
}
