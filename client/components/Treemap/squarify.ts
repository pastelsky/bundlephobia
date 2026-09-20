export type TreemapRectangle = [number, number, number, number]

export type TreemapOptions = {
  width: number
  height: number
  xoffset?: number
  yoffset?: number
}

class Container {
  private readonly xoffset: number
  private readonly yoffset: number
  private readonly width: number
  private readonly height: number

  constructor({ xoffset, yoffset, width, height }: TreemapOptions) {
    this.xoffset = xoffset ?? 0
    this.yoffset = yoffset ?? 0
    this.width = width
    this.height = height
  }

  shortestEdge() {
    return Math.min(this.height, this.width)
  }

  getCoordinates(row: number[]): TreemapRectangle[] {
    const coordinates: TreemapRectangle[] = []
    let subxoffset = this.xoffset
    let subyoffset = this.yoffset
    const rowArea = sumArray(row)
    const areawidth = rowArea / this.height
    const areaheight = rowArea / this.width

    if (this.width >= this.height) {
      for (const value of row) {
        coordinates.push([
          subxoffset,
          subyoffset,
          subxoffset + areawidth,
          subyoffset + value / areawidth,
        ])
        subyoffset += value / areawidth
      }
    } else {
      for (const value of row) {
        coordinates.push([
          subxoffset,
          subyoffset,
          subxoffset + value / areaheight,
          subyoffset + areaheight,
        ])
        subxoffset += value / areaheight
      }
    }

    return coordinates
  }

  cutArea(area: number) {
    if (this.width >= this.height) {
      const areawidth = area / this.height
      const newwidth = this.width - areawidth

      return new Container({
        xoffset: this.xoffset + areawidth,
        yoffset: this.yoffset,
        width: newwidth,
        height: this.height,
      })
    }

    const areaheight = area / this.width
    const newheight = this.height - areaheight

    return new Container({
      xoffset: this.xoffset,
      yoffset: this.yoffset + areaheight,
      width: this.width,
      height: newheight,
    })
  }
}

function normalize(data: number[], area: number) {
  const sum = sumArray(data)
  const multiplier = area / sum

  return data.map(value => value * multiplier)
}

export default function squarifyTreemap(
  data: number[],
  { width, height, xoffset = 0, yoffset = 0 }: TreemapOptions,
): TreemapRectangle[] {
  const rawTreemap = squarify(normalize(data, width * height), {
    currentrow: [],
    container: new Container({ xoffset, yoffset, width, height }),
    stack: [],
  })

  return flattenTreemap(rawTreemap)
}

function flattenTreemap(rawTreemap: TreemapRectangle[][]) {
  return rawTreemap.flat()
}

type SquarifyState = {
  currentrow: number[]
  container: Container
  stack: TreemapRectangle[][]
}

function squarify(data: number[], state: SquarifyState): TreemapRectangle[][] {
  const { currentrow, container, stack } = state

  if (data.length === 0) {
    if (currentrow.length > 0) {
      stack.push(container.getCoordinates(currentrow))
    }

    return stack
  }

  const length = container.shortestEdge()
  const nextdatapoint = data[0]

  if (improvesRatio(currentrow, nextdatapoint, length)) {
    currentrow.push(nextdatapoint)

    return squarify(data.slice(1), state)
  }

  const newcontainer = container.cutArea(sumArray(currentrow))
  stack.push(container.getCoordinates(currentrow))

  return squarify(data, {
    currentrow: [],
    container: newcontainer,
    stack,
  })
}

function improvesRatio(currentrow: number[], nextnode: number, length: number) {
  if (currentrow.length === 0) {
    return true
  }

  const newrow = currentrow.slice()
  newrow.push(nextnode)

  const currentratio = calculateRatio(currentrow, length)
  const newratio = calculateRatio(newrow, length)

  return currentratio >= newratio
}

function calculateRatio(row: number[], length: number) {
  const min = Math.min(...row)
  const max = Math.max(...row)
  const sum = sumArray(row)

  return Math.max(
    (Math.pow(length, 2) * max) / Math.pow(sum, 2),
    Math.pow(sum, 2) / (Math.pow(length, 2) * min),
  )
}

function sumArray(arr: number[]) {
  return arr.reduce((sum, value) => sum + value, 0)
}
