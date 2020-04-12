/*
 * treemap-squarify.js - open source implementation of squarified treemaps
 *
 * Treemap Squared 0.5 - Treemap Charting library
 *
 * https://github.com/imranghory/treemap-squared/
 *
 * Copyright (c) 2012 Imran Ghory (imranghory@gmail.com)
 * Licensed under the MIT (http://www.opensource.org/licenses/mit-license.php) license.
 *
 *
 * Implementation of the squarify treemap algorithm described in:
 *
 * Bruls, Mark; Huizing, Kees; van Wijk, Jarke J. (2000), "Squarified treemaps"
 * in de Leeuw, W.; van Liere, R., Data Visualization 2000:
 * Proc. Joint Eurographics and IEEE TCVG Symp. on Visualization, Springer-Verlag, pp. 33–42.
 *
 * Paper is available online at: http://www.win.tue.nl/~vanwijk/stm.pdf
 *
 * The code in this file is completeley decoupled from the drawing code so it should be trivial
 * to port it to any other vector drawing library. Given an array of datapoints this library returns
 * an array of cartesian coordinates that represent the rectangles that make up the treemap.
 *
 * The library also supports multidimensional data (nested treemaps) and performs normalization on the data.
 *
 * See the README file for more details.
 */

function Container(xoffset, yoffset, width, height) {
  this.xoffset = xoffset // offset from the the top left hand corner
  this.yoffset = yoffset // ditto
  this.height = height
  this.width = width

  this.shortestEdge = function () {
    return Math.min(this.height, this.width)
  }

  // getCoordinates - for a row of boxes which we've placed
  //                  return an array of their cartesian coordinates
  this.getCoordinates = function (row) {
    const coordinates = []
    var subxoffset = this.xoffset,
      subyoffset = this.yoffset //our offset within the container
    var areawidth = sumArray(row) / this.height
    var areaheight = sumArray(row) / this.width
    var i

    if (this.width >= this.height) {
      for (i = 0; i < row.length; i++) {
        coordinates.push([
          subxoffset,
          subyoffset,
          subxoffset + areawidth,
          subyoffset + row[i] / areawidth,
        ])
        subyoffset = subyoffset + row[i] / areawidth
      }
    } else {
      for (i = 0; i < row.length; i++) {
        coordinates.push([
          subxoffset,
          subyoffset,
          subxoffset + row[i] / areaheight,
          subyoffset + areaheight,
        ])
        subxoffset = subxoffset + row[i] / areaheight
      }
    }
    return coordinates
  }

  // cutArea - once we've placed some boxes into an row we then need to identify the remaining area,
  //           this function takes the area of the boxes we've placed and calculates the location and
  //           dimensions of the remaining space and returns a container box defined by the remaining area
  this.cutArea = function (area) {
    var newcontainer

    if (this.width >= this.height) {
      var areawidth = area / this.height
      var newwidth = this.width - areawidth
      newcontainer = new Container(
        this.xoffset + areawidth,
        this.yoffset,
        newwidth,
        this.height
      )
    } else {
      var areaheight = area / this.width
      var newheight = this.height - areaheight
      newcontainer = new Container(
        this.xoffset,
        this.yoffset + areaheight,
        this.width,
        newheight
      )
    }
    return newcontainer
  }
}

// normalize - the Bruls algorithm assumes we're passing in areas that nicely fit into our
//             container box, this method takes our raw data and normalizes the data values into
//             area values so that this assumption is valid.
function normalize(data, area) {
  var normalizeddata = []
  var sum = sumArray(data)
  var multiplier = area / sum
  var i

  for (i = 0; i < data.length; i++) {
    normalizeddata[i] = data[i] * multiplier
  }
  return normalizeddata
}

// treemapSingledimensional - simple wrapper around squarify
export default function treemapSingledimensional(
  data,
  width,
  height,
  xoffset,
  yoffset
) {
  xoffset = typeof xoffset === 'undefined' ? 0 : xoffset
  yoffset = typeof yoffset === 'undefined' ? 0 : yoffset

  var rawtreemap = squarify(
    normalize(data, width * height),
    [],
    new Container(xoffset, yoffset, width, height),
    []
  )
  return flattenTreemap(rawtreemap)
}

// flattenTreemap - squarify implementation returns an array of arrays of coordinates
//                  because we have a new array everytime we switch to building a new row
//                  this converts it into an array of coordinates.
function flattenTreemap(rawtreemap) {
  var flattreemap = []
  var i, j

  for (i = 0; i < rawtreemap.length; i++) {
    for (j = 0; j < rawtreemap[i].length; j++) {
      flattreemap.push(rawtreemap[i][j])
    }
  }
  return flattreemap
}

// squarify  - as per the Bruls paper
//             plus coordinates stack and containers so we get
//             usable data out of it
function squarify(data, currentrow, container, stack) {
  var length
  var nextdatapoint
  var newcontainer

  if (data.length === 0) {
    stack.push(container.getCoordinates(currentrow))
    return
  }

  length = container.shortestEdge()
  nextdatapoint = data[0]

  if (improvesRatio(currentrow, nextdatapoint, length)) {
    currentrow.push(nextdatapoint)
    squarify(data.slice(1), currentrow, container, stack)
  } else {
    newcontainer = container.cutArea(sumArray(currentrow), stack)
    stack.push(container.getCoordinates(currentrow))
    squarify(data, [], newcontainer, stack)
  }
  return stack
}

// improveRatio - implements the worse calculation and comparision as given in Bruls
//                (note the error in the original paper; fixed here)
function improvesRatio(currentrow, nextnode, length) {
  var newrow

  if (currentrow.length === 0) {
    return true
  }

  newrow = currentrow.slice()
  newrow.push(nextnode)

  var currentratio = calculateRatio(currentrow, length)
  var newratio = calculateRatio(newrow, length)

  // the pseudocode in the Bruls paper has the direction of the comparison
  // wrong, this is the correct one.
  return currentratio >= newratio
}

// calculateRatio - calculates the maximum width to height ratio of the
//                  boxes in this row
function calculateRatio(row, length) {
  var min = Math.min.apply(Math, row)
  var max = Math.max.apply(Math, row)
  var sum = sumArray(row)
  return Math.max(
    (Math.pow(length, 2) * max) / Math.pow(sum, 2),
    Math.pow(sum, 2) / (Math.pow(length, 2) * min)
  )
}

// isArray - checks if arr is an array
function isArray(arr) {
  return arr && arr.constructor === Array
}

// sumArray - sums a single dimensional array
function sumArray(arr) {
  var sum = 0
  var i

  for (i = 0; i < arr.length; i++) {
    sum += arr[i]
  }
  return sum
}
