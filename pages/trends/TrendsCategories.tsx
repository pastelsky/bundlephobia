import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '../../client/components/ui'
import {
  getCategoryCompareAllPath,
  type TrendsCategory,
} from '../../seo/trends-categories'
import { trendsComparisonCanonicalPath } from '../../seo/trends-comparisons'
import CategoryStamp, {
  CategoryStampDefs,
} from '../../client/components/CategoryStamp/CategoryStamp'
import {
  DEFAULT_CATEGORY_DESCRIPTION,
  DEFAULT_CATEGORY_STAMP,
} from '../../client/components/CategoryStamp/categoryStampMeta'

const DECK_SIZE = 4

const REVEAL_STEP = 6

type TrendsCategoriesProps = {
  sampledCategories: TrendsCategory[]
  allCategories: TrendsCategory[]
}

function PackageToken({ pkg, large }: { pkg: string; large?: boolean }) {
  return (
    <Link
      href={trendsComparisonCanonicalPath([pkg])}
      className={`trends-bento__token${large ? ' trends-bento__token--lg' : ''}`}
      title={`View trends for ${pkg}`}
    >
      {pkg}
    </Link>
  )
}

function CategoryCard({ category }: { category: TrendsCategory }) {
  const compareLabel =
    category.packages.length > 2 ? 'Compare all →' : 'Compare →'

  const stamp = category.stamp ?? DEFAULT_CATEGORY_STAMP
  const description = category.description ?? DEFAULT_CATEGORY_DESCRIPTION

  return (
    <article className="trends-bento__card">
      <header className="trends-bento__card-head">
        <div className="trends-bento__card-title-group">
          <CategoryStamp stamp={stamp} size={30} />
          <h3 className="trends-bento__card-title">{category.title}</h3>
        </div>
        <Link
          href={getCategoryCompareAllPath(category)}
          className="trends-bento__compare-all"
          title={`Compare ${category.title}`}
        >
          {compareLabel}
        </Link>
      </header>
      <p className="trends-bento__desc">{description}</p>
      <div className="trends-bento__tokens">
        {category.packages.slice(0, 4).map(pkg => (
          <PackageToken key={pkg} pkg={pkg} />
        ))}
      </div>
    </article>
  )
}

function SpotlightCard({ category }: { category: TrendsCategory }) {
  const count = Math.min(category.packages.length, 5)
  const ctaLabel = count > 2 ? `Compare all ${count} →` : `Compare ${count} →`
  const stamp = category.stamp ?? DEFAULT_CATEGORY_STAMP
  const description = category.description ?? DEFAULT_CATEGORY_DESCRIPTION

  return (
    <article className="trends-bento__spotlight" data-ink={stamp.ink}>
      <div className="trends-bento__spotlight-meta">
        <span className="trends-bento__eyebrow">Spotlight</span>
        <span className="trends-bento__count">
          {category.packages.length} packages
        </span>
      </div>

      <div className="trends-bento__spotlight-head">
        <CategoryStamp stamp={stamp} size={38} />
        <h3 className="trends-bento__spotlight-title">{category.title}</h3>
      </div>

      <p className="trends-bento__desc trends-bento__desc--spotlight">
        {description}
      </p>

      <div className="trends-bento__tokens">
        {category.packages.slice(0, 5).map(pkg => (
          <PackageToken key={pkg} pkg={pkg} large />
        ))}
      </div>

      <Link
        href={getCategoryCompareAllPath(category)}
        className="ui-button ui-button--primary ui-button--sm trends-bento__spotlight-cta"
      >
        {ctaLabel}
      </Link>
    </article>
  )
}

export default function TrendsCategories({
  sampledCategories,
  allCategories,
}: TrendsCategoriesProps) {
  const [revealedCount, setRevealedCount] = useState(0)

  const orderedCategories = useMemo(() => {
    const sampledIds = new Set(sampledCategories.map(cat => cat.id))

    const rest = allCategories
      .filter(cat => !sampledIds.has(cat.id))
      .sort((a, b) => a.title.localeCompare(b.title))

    return [...sampledCategories, ...rest]
  }, [allCategories, sampledCategories])

  const [spotlight, ...others] = orderedCategories
  const deck = others.slice(0, DECK_SIZE)
  const pool = others.slice(DECK_SIZE)
  const revealed = pool.slice(0, revealedCount)
  const remaining = pool.length - revealed.length

  if (!spotlight) return null

  return (
    <section
      className="trends-categories trends-bento"
      aria-labelledby="trends-categories-heading"
    >
      <CategoryStampDefs />

      <div className="trends-bento__head">
        <h2 id="trends-categories-heading" className="trends-bento__heading">
          Popular comparisons by category
        </h2>
      </div>

      <div className="trends-bento__grid">
        <SpotlightCard category={spotlight} />
        <div className="trends-bento__deck">
          {deck.map(category => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </div>

      {revealed.length > 0 && (
        <div className="trends-bento__more-grid">
          {revealed.map(category => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}

      {(remaining > 0 || revealed.length > 0) && (
        <div className="trends-bento__footer">
          {revealed.length > 0 && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setRevealedCount(0)}
            >
              Show less
            </Button>
          )}
          {remaining > 0 && (
            <Button
              size="sm"
              onClick={() => setRevealedCount(count => count + REVEAL_STEP)}
            >
              Show more
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
