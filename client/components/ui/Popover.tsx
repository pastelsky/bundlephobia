import React from 'react'
import { Popover as BasePopover } from '@base-ui/react/popover'

type PopoverProps = {
  trigger: React.ReactElement
  children: React.ReactNode
  label: string
}

export function Popover({ trigger, children, label }: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger
        render={trigger}
        className="ui-popover__trigger"
        aria-label={label}
      />
      <BasePopover.Portal>
        <BasePopover.Positioner
          sideOffset={8}
          align="end"
          className="ui-popover__positioner"
        >
          <BasePopover.Popup className="ui-popover__content">
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}
