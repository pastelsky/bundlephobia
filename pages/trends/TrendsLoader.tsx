import React, { useEffect, useMemo, useRef } from 'react'
import anime from 'animejs'

import {
  DRAW_EASINGS,
  debugLoader,
  generateRandomLoaderData,
  inverseEasing,
  lightenColor,
  pathDistanceAtPoint,
  randomBetween,
  randomInteger,
} from './trendsLoaderData'

export default function TrendsLoader() {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialData = useMemo(() => generateRandomLoaderData(), [])
  const { curves, nodes } = initialData
  const shape = initialData.shape

  useEffect(() => {
    if (!containerRef.current) return

    const pathElements = containerRef.current.querySelectorAll<SVGPathElement>(
      '.trends-loader__trail'
    )
    const nodeElements =
      containerRef.current.querySelectorAll<SVGCircleElement>(
        '.trends-loader__dot'
      )
    let stopped = false
    let activeAnimations: anime.AnimeInstance[] = []
    let activeTimers: Array<ReturnType<typeof setTimeout>> = []
    let cycleTimer: ReturnType<typeof setTimeout> | undefined

    const animateIteration = () => {
      if (stopped) return

      activeAnimations.forEach(animation => animation.pause())
      activeAnimations = []
      activeTimers.forEach(timer => clearTimeout(timer))
      activeTimers = []
      if (cycleTimer) clearTimeout(cycleTimer)

      const cycleStartedAt = performance.now()
      const scheduleAt = (offset: number, callback: () => void) => {
        const elapsed = performance.now() - cycleStartedAt
        const timer = setTimeout(callback, Math.max(0, offset - elapsed))
        activeTimers.push(timer)
      }
      const next = generateRandomLoaderData(shape)
      const dotAppearanceDuration = randomInteger(260, 330)
      // The installed Anime.js runtime exposes `easing`, while its legacy
      // DefinitelyTyped declaration incorrectly calls this helper `easings`.
      const getEasing = (name: string) =>
        (
          anime as unknown as {
            easing: (easingName: string) => (elapsed: number) => number
          }
        ).easing(name)
      pathElements.forEach((path, index) => {
        const curve = next.curves[index]
        path.setAttribute('d', curve.d)
        path.setAttribute('stroke', curve.grayscale)
        path.style.opacity = `${curve.initialOpacity}`
        const length = path.getTotalLength()
        path.style.strokeDasharray = `${length}`
        path.style.strokeDashoffset = `${length}`
      })
      nodeElements.forEach((node, index) => {
        const point = next.nodes[index]
        node.setAttribute('cx', `${point.x}`)
        node.setAttribute('cy', `${point.y}`)
        node.setAttribute('fill', lightenColor(point.color))
        node.style.opacity = '0'
        node.setAttribute('r', '1.6')
      })

      const groupStagger = randomInteger(420, 540)
      const blankLeadIn = randomInteger(80, 130)
      const lineStagger = anime.stagger(groupStagger, {
        from: 'first',
        start: blankLeadIn,
      })
      let cycleEnd = 0
      debugLoader('cycle:start', {
        at: 0,
        curveCount: next.curves.length,
        nodeCount: next.nodes.length,
        blankLeadIn,
        groupStagger,
      })
      next.curves.forEach((curve, curveIndex) => {
        const drawEasingName =
          DRAW_EASINGS[Math.min(curveIndex, DRAW_EASINGS.length - 1)]
        const drawEasing = getEasing(drawEasingName)
        const lineOffset =
          lineStagger(
            null as unknown as HTMLElement,
            curveIndex,
            next.curves.length
          ) + randomInteger(0, 35)
        const lineNodes = next.nodes
          .map((node, nodeIndex) => ({ node, nodeIndex }))
          .filter(({ node }) => node.curveIndex === curveIndex)
        const nodePhaseEnd =
          lineOffset +
          Math.max(...lineNodes.map(({ node }) => node.appearanceDelay), 0) +
          dotAppearanceDuration
        const drawStart = nodePhaseEnd + curve.delay
        const colorStart = drawStart + curve.duration
        const fadeStart = colorStart + curve.colorDuration + curve.holdDuration
        cycleEnd = Math.max(cycleEnd, fadeStart + curve.fadeDuration)
        debugLoader('line:schedule', {
          group: curveIndex,
          offset: lineOffset,
          dotAppearanceEnd: nodePhaseEnd,
          drawStart,
          drawEasing: drawEasingName,
          pulseCount: lineNodes.length,
          colorStart: drawStart + curve.duration,
          fadeStart:
            drawStart +
            curve.duration +
            curve.colorDuration +
            curve.holdDuration,
          fadeDuration: curve.fadeDuration,
        })

        lineNodes.forEach(({ node, nodeIndex }) => {
          const appearanceStart = lineOffset + node.appearanceDelay
          const progress = pathDistanceAtPoint(pathElements[curveIndex], node)
          const contactAt =
            drawStart + inverseEasing(progress, drawEasing) * curve.duration
          debugLoader('dot:schedule', {
            group: curveIndex,
            node: nodeIndex,
            appearanceStart,
            pathProgress: Number(progress.toFixed(4)),
            contactAt: Math.round(contactAt),
          })
        })

        lineNodes.forEach(({ node, nodeIndex }) =>
          activeAnimations.push(
            anime({
              targets: nodeElements[nodeIndex],
              r: [1.6, 2.45, 2.2],
              opacity: [0, 1],
              duration: dotAppearanceDuration,
              easing: 'easeOutQuad',
              delay: lineOffset + node.appearanceDelay,
              changeBegin: () =>
                debugLoader('dot:begin', {
                  group: curveIndex,
                  node: nodeIndex,
                  elapsed: Math.round(performance.now() - cycleStartedAt),
                }),
              complete: () =>
                debugLoader('dot:complete', {
                  group: curveIndex,
                  node: nodeIndex,
                  elapsed: Math.round(performance.now() - cycleStartedAt),
                }),
            })
          )
        )
        activeAnimations.push(
          anime({
            targets: pathElements[curveIndex],
            strokeDashoffset: [anime.setDashoffset, 0],
            opacity: [curve.initialOpacity, curve.peakOpacity],
            duration: curve.duration,
            easing: drawEasingName,
            delay: drawStart,
            changeBegin: () =>
              debugLoader('line:draw-begin', {
                group: curveIndex,
                elapsed: Math.round(performance.now() - cycleStartedAt),
              }),
          })
        )
        activeAnimations.push(
          anime({
            targets: pathElements[curveIndex],
            stroke: curve.color,
            duration: curve.colorDuration,
            easing: 'easeInOutSine',
            delay: colorStart,
            changeBegin: () =>
              debugLoader('line:color-begin', {
                group: curveIndex,
                elapsed: Math.round(performance.now() - cycleStartedAt),
              }),
          })
        )
        activeAnimations.push(
          anime({
            targets: pathElements[curveIndex],
            opacity: [curve.peakOpacity, 0],
            duration: curve.fadeDuration,
            easing: 'easeInOutSine',
            delay: fadeStart,
            changeBegin: () =>
              debugLoader('line:fade-begin', {
                group: curveIndex,
                elapsed: Math.round(performance.now() - cycleStartedAt),
              }),
          })
        )

        lineNodes.forEach(({ node, nodeIndex }) => {
          const progress = pathDistanceAtPoint(pathElements[curveIndex], node)
          const contactAt =
            drawStart + inverseEasing(progress, drawEasing) * curve.duration
          const expandedRadius = randomBetween(4, 5.2)
          // Start expansion at the exact point where the drawn path reaches
          // the node. Starting early makes the dot look detached from the
          // line, especially on the slower easing curves.
          const expansionDuration = randomInteger(260, 420)
          const pulseStart = contactAt
          debugLoader('dot:pulse-schedule', {
            group: curveIndex,
            node: nodeIndex,
            pathProgress: Number(progress.toFixed(4)),
            pulseStart: Math.round(pulseStart),
            expandCompleteAt: Math.round(pulseStart + expansionDuration),
            contactAt: Math.round(contactAt),
            expandedRadius: Number(expandedRadius.toFixed(2)),
          })
          scheduleAt(pulseStart, () => {
            if (stopped) return
            debugLoader('dot:pulse-begin', {
              group: curveIndex,
              node: nodeIndex,
              elapsed: Math.round(performance.now() - cycleStartedAt),
            })
            let completionLogged = false
            activeAnimations.push(
              anime({
                targets: nodeElements[nodeIndex],
                r: [2.2, expandedRadius],
                duration: expansionDuration,
                easing: 'easeInOutSine',
                update: animation => {
                  if (!completionLogged && animation.progress >= 99) {
                    completionLogged = true
                    debugLoader('dot:expand-complete', {
                      group: curveIndex,
                      node: nodeIndex,
                      elapsed: Math.round(performance.now() - cycleStartedAt),
                      contactAt: Math.round(contactAt),
                      timingError: Math.round(
                        performance.now() - cycleStartedAt - contactAt
                      ),
                    })
                  }
                },
              })
            )
          })
          scheduleAt(fadeStart, () => {
            if (stopped) return
            activeAnimations.push(
              anime({
                targets: nodeElements[nodeIndex],
                opacity: [1, 0],
                r: [expandedRadius, 1.4],
                duration: curve.fadeDuration,
                easing: 'easeInOutSine',
              })
            )
          })
        })
      })

      debugLoader('cycle:scheduled', {
        duration: cycleEnd,
        nextCycleIn: cycleEnd + 80,
      })
      cycleTimer = setTimeout(() => {
        debugLoader('cycle:complete', {
          elapsed: Math.round(performance.now() - cycleStartedAt),
        })
        animateIteration()
      }, Math.max(0, cycleEnd + 80 - (performance.now() - cycleStartedAt)))
    }

    animateIteration()

    const labelAnimation = anime({
      targets: containerRef.current.querySelector('.trends-loader__label'),
      opacity: [0.4, 0.95],
      duration: randomInteger(900, 1500),
      easing: 'easeInOutSine',
      loop: true,
      direction: 'alternate',
    })

    return () => {
      stopped = true
      if (cycleTimer) clearTimeout(cycleTimer)
      activeTimers.forEach(timer => clearTimeout(timer))
      activeAnimations.forEach(animation => animation.pause())
      labelAnimation.pause()
    }
  }, [shape])

  return (
    <div className="trends-loader" ref={containerRef}>
      <div className="trends-loader__header">
        <span className="trends-loader__label">
          [ ANALYZING PACKAGE TRENDS ]
        </span>
      </div>

      <svg
        className="trends-loader__canvas"
        viewBox="0 0 1140 380"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="0"
          y1="10"
          x2="1140"
          y2="10"
          className="trends-loader__grid"
        />
        <line
          x1="0"
          y1="92.5"
          x2="1140"
          y2="92.5"
          className="trends-loader__grid"
        />
        <line
          x1="0"
          y1="175"
          x2="1140"
          y2="175"
          className="trends-loader__grid"
        />
        <line
          x1="0"
          y1="257.5"
          x2="1140"
          y2="257.5"
          className="trends-loader__grid"
        />
        <line
          x1="0"
          y1="340"
          x2="1140"
          y2="340"
          className="trends-loader__axis"
        />
        <line
          x1="285"
          y1="10"
          x2="285"
          y2="340"
          className="trends-loader__grid"
        />
        <line
          x1="570"
          y1="10"
          x2="570"
          y2="340"
          className="trends-loader__grid"
        />
        <line
          x1="855"
          y1="10"
          x2="855"
          y2="340"
          className="trends-loader__grid"
        />
        <line
          x1="1140"
          y1="10"
          x2="1140"
          y2="340"
          className="trends-loader__grid"
        />

        {curves.map((curve, index) => (
          <path
            key={`${curve.color}-${index}`}
            className="trends-loader__trail"
            d={curve.d}
            fill="none"
            stroke={curve.color}
          />
        ))}

        <g className="trends-loader__nodes">
          {nodes.map((node, index) => (
            <circle
              key={`${node.x}-${node.y}-${index}`}
              cx={node.x}
              cy={node.y}
              r="2"
              className="trends-loader__dot"
              fill={lightenColor(node.color)}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
