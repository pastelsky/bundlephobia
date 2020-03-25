import React, { Component } from 'react'
import cx from 'classnames'
import './AutocompleteInputBox.scss'

class AutocompleteInputBox extends Component {
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
