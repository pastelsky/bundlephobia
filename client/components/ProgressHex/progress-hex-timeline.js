import anime from 'animejs'
import colors from '../../config/colors'
import { zeroToN, randomFromArray } from 'utils/index'

const DURATION = 1000

export default class ProgressHexAnimator {
  constructor({ svg }) {
    this.circlesMap = new Map()
    this.circles = svg.querySelectorAll('circle')
    this.rings = svg.querySelectorAll('g')
    this.trailBlaze = new Trailblaze({
      linesCount: 55,
      svg,
      circlesMap: this.circlesMap,
      ringsCount: this.rings.length,
    })

    Array.from(this.circles).forEach(circle => {
      const cx = parseFloat(circle.getAttribute('cx'))
      const cy = parseFloat(circle.getAttribute('cy'))
      circle.style.transformOrigin = `${cx}px ${cy}px`
      this.circlesMap.set(circle, {
        cx,
        cy,
        ringNumber: parseInt(circle.parentElement.id.match(/.+(\d+)/)[1]) - 1,
      })

      this.width = parseFloat(svg.getAttribute('width'))
      this.height = parseFloat(svg.getAttribute('height'))
    })
  }

  getTranslation(circle, distance) {
    const { cx, cy } = this.circlesMap.get(circle)
    const { x, y } = this.pointAtDistance(
      cx,
      cy,
      this.width / 2,
      this.height / 2,
      distance
    )

    return { x: x - cx, y: y - cy }
  }

  pointAtDistance(x1, y1, x2, y2, d) {
    const curDistanceBetweenPoints = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (curDistanceBetweenPoints === 0) return { x: x1, y: y1 }

    const t = d / curDistanceBetweenPoints
    const x = (x1 - t * x2) / (1 - t)
    const y = (y1 - t * y2) / (1 - t)
    return { x, y }
  }

  createTimeline() {
    const timeline = anime.timeline({
      duration: DURATION,
      autoplay: false,
      loop: true,
    })

    const fadeInRings = {
      targets: this.rings,
      opacity: [0, 1],
      delay: anime.stagger(DURATION / 5, { from: 'last' }),
      duration: DURATION / 2,
      easing: 'linear',
    }

    const quakeCircles = {
      targets: this.circles,
      scale: el => (this.circlesMap.get(el).ringNumber === 0 ? 3 : 1.5),
      translateY: circle => this.getTranslation(circle, 4).y,
      translateX: circle => this.getTranslation(circle, 4).x,
      delay: (el, i) =>
        (Math.pow(this.circlesMap.get(el).ringNumber, 0.6) * DURATION) / 4 +
        (this.circlesMap.get(el).ringNumber > 0 ? DURATION / 2.5 : 0),
      duration: DURATION,
      easing: () => t => Math.sin(t * Math.PI),
      changeBegin: () => this.trailBlaze.start(),
    }

    timeline.add(fadeInRings)
    for (let i = 0; i <= 50; i++) {
      timeline.add(quakeCircles)
    }
    return timeline
  }
}

class Trailblaze {
  constructor({ linesCount, svg, circlesMap, ringsCount }) {
    this.lines = []
    this.circlesMap = circlesMap
    this.ringsCount = ringsCount
    for (let i = 0; i < linesCount; i++) {
      const line = this.createTrail()
      this.lines.push(line)
      svg.insertBefore(line, svg.children[0])
    }
  }

  createTrail() {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('stroke-width', '0.5')
    line.setAttribute('class', 'progress-hex__trail')
    return line
  }

  setLineCoords(line, x1 = 0, x2 = 0, y1 = 0, y2 = 0) {
    line.setAttribute('x1', `${x1}`)
    line.setAttribute('x2', `${x2}`)
    line.setAttribute('y1', `${y1}`)
    line.setAttribute('y2', `${y2}`)
  }

  getCirclesInRing(ringNumber) {
    const circles = []
    this.circlesMap.forEach(value => {
      if (value.ringNumber === ringNumber) {
        circles.push(value)
      }
    })
    return circles
  }

  distanceBetweenCircles(c1, c2) {
    return Math.sqrt((c2.cx - c1.cx) ** 2 + (c2.cy - c1.cy) ** 2)
  }

  getRandomConnection() {
    const rings = zeroToN(this.ringsCount)
    const sourceRingNumber = randomFromArray(rings.slice(0, -1))
    const destinationRingNumber = sourceRingNumber + 1

    const eligibleSourceCircles = this.getCirclesInRing(sourceRingNumber)
    const sourceCircle = randomFromArray(eligibleSourceCircles)

    const eligibleDestinationCircles = this.getCirclesInRing(
      destinationRingNumber
    )

    const destinationCircleDistances = eligibleDestinationCircles.map(
      (circle, index) => ({
        index,
        distance: this.distanceBetweenCircles(sourceCircle, circle),
      })
    )

    const eligibleDistancesMin = Math.min(
      ...destinationCircleDistances.map(a => a.distance)
    )
    const eligibleDestinationIndexes = destinationCircleDistances
      .filter(c => Math.abs(eligibleDistancesMin - c.distance) < 2)
      .map(d => d.index)

    const destinationCircle =
      eligibleDestinationCircles[randomFromArray(eligibleDestinationIndexes)]

    return {
      source: sourceCircle,
      destination: destinationCircle,
    }
  }

  getDashOffset = element => {
    if (!element) return 0
    try {
      return anime.setDashoffset(element)
    } catch (err) {
      // Called before the element was rendered
      console.error(err)
      return 0
    }
  }

  start() {
    const lineMap = new WeakMap()

    this.lines.forEach(line => {
      const { source, destination } = this.getRandomConnection()
      lineMap.set(line, { source, destination })
      line.setAttribute('stroke', randomFromArray(colors))
      this.setLineCoords(
        line,
        source.cx,
        destination.cx,
        source.cy,
        destination.cy
      )
    })

    anime({
      targets: this.lines,
      opacity: [1, 0.9, 0],
      strokeDashoffset: [el => this.getDashOffset(el), 0],
      x1: el => lineMap.get(el).source.cx,
      x2: el => lineMap.get(el).destination.cx,
      y1: el => lineMap.get(el).source.cy,
      y2: el => lineMap.get(el).destination.cy,
      duration: 500,
      delay: () => anime.random(0, DURATION / 5),
      easing: 'easeOutCubic',
    })
  }
}
