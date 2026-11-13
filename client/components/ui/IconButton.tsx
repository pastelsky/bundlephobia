import React from 'react'
import cx from 'classnames'

import type { ButtonProps } from './Button'

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  children: React.ReactNode
  label: string
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      children,
      label,
      size = 'md',
      title,
      type = 'button',
      variant = 'secondary',
      ...props
    },
    ref,
  ) => (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        'ui-icon-button',
        `ui-icon-button--${size}`,
        className,
      )}
      aria-label={label}
      title={title ?? label}
    >
      {children}
    </button>
  ),
)

IconButton.displayName = 'IconButton'
