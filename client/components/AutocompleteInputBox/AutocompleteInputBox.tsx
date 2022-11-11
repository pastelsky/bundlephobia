import React from 'react'
import cx from 'classnames'

import { WithClassName } from '../../../types'

type AutocompleteInputBoxProps = React.PropsWithChildren &
  WithClassName & {
    footer?: React.ReactNode
  }

export function AutocompleteInputBox({
  children,
  footer,
  className,
}: AutocompleteInputBoxProps) {
  return (
    <div className={cx('autocomplete-input-box', className)}>
      {children}
      {footer && <div className="autocomplete-input-box__footer">{footer}</div>}
    </div>
  )
}
