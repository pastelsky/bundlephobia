import { useMemo } from 'react'
import { Reading } from '../types'

export function useBarGraph({ readings }: { readings: Reading[] }) {
  const graphScale = useMemo(() => {
    const gzipValues = readings
      .filter(reading => !reading.disabled)
      .map(reading => reading.gzip)

    const sizeValues = readings
      .filter(reading => !reading.disabled)
      .map(reading => reading.size)

    const maxValue = Math.max(...[...gzipValues, ...sizeValues])
    return 100 / maxValue
  }, [readings])

  const firstSideEffectFreeIndex = useMemo(() => {
    const sideEffectFreeIntroducedRecently = !readings.every(
      reading => !reading.hasSideEffects
    )
    const firstSideEffectFreeIndex = readings.findIndex(
      reading => !(reading.disabled || reading.hasSideEffects)
    )

    return sideEffectFreeIntroducedRecently ? firstSideEffectFreeIndex : -1
  }, [readings])

  const firstTreeshakeableIndex = useMemo(() => {
    const treeshakingIntroducedRecently = !readings.every(
      reading => reading.hasJSModule
    )
    const firstTreeshakingIndex = readings.findIndex(
      reading =>
        !reading.disabled &&
        (reading.hasJSModule || reading.hasJSNext || reading.isModuleType)
    )

    return treeshakingIntroducedRecently ? firstTreeshakingIndex : -1
  }, [readings])

  return { graphScale, firstSideEffectFreeIndex, firstTreeshakeableIndex }
}
