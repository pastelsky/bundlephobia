import { sanitizeHTML } from 'utils/common.utils'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import React from 'react'
import './InterLinksSectionCard.scss'

export default function InterLinksSectionCard(props) {
  const { description, name, date } = props

  return (
    <Link href={`/package/${name}`}>
      <a className="interlinks-card">
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
      </a>
    </Link>
  )
}
