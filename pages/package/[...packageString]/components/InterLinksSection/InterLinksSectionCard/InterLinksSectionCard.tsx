import { sanitizeHTML } from '../../../../../../utils/common.utils'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import React from 'react'

interface InterLinksSectionCardProps {
  description: string
  name: string
  date: string | number | Date
}

export default function InterLinksSectionCard(
  props: InterLinksSectionCardProps
) {
  const { description, name, date } = props

  return (
    <Link href={`/package/${name}`} className="interlinks-card">
      <div className="interlinks-card__wrap">
        <div className="interlinks-card__header">
          <h4 className="interlinks-card__name">{name}</h4>
        </div>
        <p
          className="interlinks-card__description"
          dangerouslySetInnerHTML={{
            __html: sanitizeHTML(description),
          }}
        />
        <div className="interlinks-card__publish-date">
          published {formatDistanceToNow(new Date(date), { addSuffix: true })}
        </div>
      </div>
    </Link>
  )
}
