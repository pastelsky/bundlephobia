import React, { Component } from 'react'
import cx from 'classnames'

import { WithClassName } from '../../../types'

type AutocompleteInputBoxProps = React.PropsWithChildren &
  WithClassName & {
    footer?: React.ReactNode
  }

class AutocompleteInputBox extends Component<AutocompleteInputBoxProps> {
  render() {
    const { children, footer, className } = this.props
    return (
      <div className={cx('autocomplete-input-box', className)}>
        {children}
        {footer && (
          <div className="autocomplete-input-box__footer">{footer}</div>
        )}
      </div>
    )
  }
}

export default AutocompleteInputBox
