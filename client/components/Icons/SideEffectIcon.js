import React from 'react'
import cx from 'classnames'
import SideEffectIconSVG from '../../assets/side-effect.svg'

export default function TreeShakeIcon({ className }) {
  return (
    <SideEffectIconSVG className={cx(className, 'sideeffect-icon-animated')} />
  )
}
