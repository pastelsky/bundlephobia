import React from 'react'
import cx from 'classnames'

import { WithClassName } from '../../../types'
import SideEffectIconSVG from '../../assets/side-effect.svg'

export default function TreeShakeIcon({ className }: WithClassName) {
  return (
    <SideEffectIconSVG className={cx(className, 'sideeffect-icon-animated')} />
  )
}
