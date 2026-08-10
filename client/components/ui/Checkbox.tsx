import React from 'react'
import cx from 'classnames'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'

type CheckboxProps = React.ComponentProps<typeof BaseCheckbox.Root> & {
  label: React.ReactNode
}

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className={cx('ui-checkbox', className)}>
      <BaseCheckbox.Root className="ui-checkbox__control" {...props}>
        <BaseCheckbox.Indicator className="ui-checkbox__indicator">
          ✓
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  )
}
