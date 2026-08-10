import React from 'react'
import cx from 'classnames'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'

type ToggleOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

type ToggleGroupProps = {
  options: ToggleOption[]
  value: string
  onValueChange: (value: string) => void
  className?: string
  size?: 'sm' | 'md'
  'aria-label': string
}

export function ToggleGroup({
  options,
  value,
  onValueChange,
  className,
  size = 'md',
  ...props
}: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      {...props}
      className={cx('ui-toggle-group', `ui-toggle-group--${size}`, className)}
      value={[value]}
      onValueChange={values => values[0] && onValueChange(values[0])}
    >
      {options.map(option => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className="ui-toggle-group__item"
        >
          {option.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  )
}
