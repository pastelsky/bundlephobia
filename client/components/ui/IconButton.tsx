import React from 'react'
import cx from 'classnames'

import { Button, type ButtonProps } from './Button'

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  children: React.ReactNode
  label: string
}

export const IconButton = React.forwardRef<HTMLElement, IconButtonProps>(
  ({ className, label, title, ...props }, ref) => (
    <Button
      {...props}
      ref={ref}
      className={cx('ui-icon-button', className)}
      aria-label={label}
      title={title ?? label}
    />
  )
)

IconButton.displayName = 'IconButton'
