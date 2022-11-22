import React, { useCallback, useEffect, useRef, useState } from 'react'

import { ProgressHex } from '../ProgressHex'

const OptimisticLoadTimeout = 700

type BuildProgressIndicatorProps = {
  isDone: boolean
  onDone: () => void
}

const order = ['resolving', 'building', 'minifying', 'calculating'] as const

export function BuildProgressIndicator({
  isDone,
  onDone,
}: BuildProgressIndicatorProps) {
  const timeout = useRef<NodeJS.Timeout>()
  const [stage, setStage] = useState<number>(0)
  const [started, setStarted] = useState<boolean>(false)
  const [progressText, setProgressText] = useState<string | null>(null)

  const setMessage = useCallback((stage = 0) => {
    const timings = {
      resolving: 3 + Math.random() * 2,
      building: 5 + Math.random() * 3,
      minifying: 3 + Math.random() * 2,
      calculating: 20,
    }

    if (stage === order.length) return

    setProgressText(getProgressText(order[stage]))

    timeout.current = setTimeout(() => {
      if (stage < order.length) {
        stage += 1
      }

      setMessage(stage)
    }, timings[order[stage]] * 1000)
  }, [])

  useEffect(() => {
    setTimeout(() => {
      if (!isDone) {
        setStarted(true)
        setMessage()
      }
    }, OptimisticLoadTimeout)
  }, [isDone, setMessage])

  useEffect(() => {
    if (isDone) {
      setStage(3)
      onDone()
    }
  }, [isDone, onDone])

  useEffect(() => {
    return () => {
      clearTimeout(timeout.current)
    }
  }, [])

  if (!started) return null

  return (
    <div className="build-progress-indicator">
      <ProgressHex compact />
      <p className="build-progress-indicator__text">{progressText}</p>
    </div>
  )
}

function getProgressText(stage: typeof order[number]) {
  const progressText = {
    resolving: 'Resolving version and dependencies',
    building: 'Bundling package',
    minifying: 'Minifying, GZipping',
    calculating: 'Calculating file sizes',
  }
  return progressText[stage]
}
