import React from 'react'
import cx from 'classnames'
import TreeShakeIconSVG from '../../assets/tree-shake.svg'
import './TreeShakeIcon.scss'

export default function TreeShakeIcon({ className }) {
  return (
    <TreeShakeIconSVG className={cx(className, 'treeshake-icon-animated')} />
  )
}
