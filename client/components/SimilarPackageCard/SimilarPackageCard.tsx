import React, { Component } from 'react'
import cx from 'classnames'
import Link from 'next/link'
import queryString from 'query-string'

import { formatSize } from '../../../utils'
import { sanitizeHTML } from '../../../utils/common.utils'
import TreeShakeIcon from '../../assets/tree-shake.svg'
import PlusIcon from '../../assets/plus.svg'
import GithubIcon from '../../assets/github-logo.svg'
import GitIcon from '../../assets/git-logo.svg'

type SimilarPackageCardProps = { category?: string } & (
  | { pack: any; comparisonSizePercent: number }
  | { isEmpty: true }
)

export default class SimilarPackageCard extends Component<SimilarPackageCardProps> {
  getSuggestionIssueUrl = () => {
    const params = queryString.stringify({
      labels: 'similar suggestion',
      template: '2-similar-package-suggestion.md',
      title: `Package suggestion: <package-name> for \`${this.props.category}\``,
    })

    return `https://github.com/pastelsky/bundlephobia/issues/new?${params}`
  }

  render() {
    if ('isEmpty' in this.props) {
      return (
        <a
          className="similar-package-card similar-package-card--empty"
          href={this.getSuggestionIssueUrl()}
          target="_blank"
          rel="noreferrer noopener"
        >
          <div className="similar-package-card__wrap">
            <PlusIcon className="similar-package-card__plus" />
            <p className="similar-package-card__description">Suggest another</p>
          </div>
        </a>
      )
    }

    const { pack, comparisonSizePercent } = this.props
    const { size, unit } = formatSize(pack.gzip)
    const sizeDiff = Math.abs(
      (comparisonSizePercent / 100) * pack.gzip - pack.gzip
    )

    const getComparisonNumber = (comparisonSizePercent: number) => {
      if (sizeDiff < 1500) {
        return (
          <div>
            <div className="similar-package-card__label">
              Similar <br /> size
            </div>
          </div>
        )
      } else if (Math.abs(comparisonSizePercent) > 100) {
        return (
          <div>
            <div className="similar-package-card__number">
              {(1 + Math.abs(comparisonSizePercent) / 100).toFixed(1)}{' '}
              <span className="similar-package-card__shrink">×</span>
            </div>
            <div className="similar-package-card__label">
              {comparisonSizePercent > 0 ? 'Larger' : 'Smaller'}
            </div>
          </div>
        )
      } else {
        return (
          <div>
            <div className="similar-package-card__number">
              {Math.abs(comparisonSizePercent).toFixed(0)}{' '}
              <span className="similar-package-card__shrink">%</span>
            </div>
            <div className="similar-package-card__label">
              {comparisonSizePercent > 0 ? 'Larger' : 'Smaller'}
            </div>
          </div>
        )
      }
    }

    const footer = (
      <div className="similar-package-card__footer">
        <div
          className={cx('similar-package-card__stat', {
            'similar-package-card__comparison--similar': sizeDiff < 1500,
            'similar-package-card__comparison--positive':
              comparisonSizePercent < 0,
            'similar-package-card__comparison--negative':
              comparisonSizePercent > 0,
          })}
        >
          {getComparisonNumber(comparisonSizePercent)}
        </div>
        <div className="similar-package-card__stat similar-package-card__size">
          <div className="similar-package-card__number">
            {size.toFixed(2)}
            <span className="similar-package-card__shrink"> {unit} </span>
          </div>
          <div className="similar-package-card__label">Min + Gzip</div>
        </div>

        {(pack.hasJSModule || pack.hasJSNext || pack.isModuleType) && (
          <TreeShakeIcon className="similar-package-card__treeshake" />
        )}
      </div>
    )

    return (
      <Link href={`/package/${pack.name}`} className="similar-package-card">
        <div className="similar-package-card__wrap">
          <div className="similar-package-card__header">
            <h3 className="similar-package-card__name">{pack.name}</h3>
            {pack.repository && (
              <a
                href={pack.repository}
                onClick={e => {
                  e.stopPropagation()
                  window.location = pack.repository
                }}
              >
                {pack.repository.includes('github.com') ? (
                  <GithubIcon className="similar-package-card__github-icon" />
                ) : (
                  <GitIcon className="similar-package-card__github-icon" />
                )}
              </a>
            )}
          </div>
          <p
            className="similar-package-card__description"
            dangerouslySetInnerHTML={{
              __html: sanitizeHTML(pack.description),
            }}
          />
        </div>
        {footer}
      </Link>
    )
  }
}
