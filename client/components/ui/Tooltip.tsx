import React from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'

type TooltipProps = { children: React.ReactElement; content: React.ReactNode }

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} className="ui-tooltip__trigger" />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          sideOffset={6}
          className="ui-tooltip__positioner"
        >
          <BaseTooltip.Popup className="ui-tooltip__content">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
