import React from 'react'
import cx from 'classnames'

import { WithClassName } from '../../../types'
import TreeShakeIconSVG from '../../assets/tree-shake.svg'

export default function TreeShakeIcon({ className }: WithClassName) {
  return (
    <TreeShakeIconSVG className={cx(className, 'treeshake-icon-animated')} />
  )
}
