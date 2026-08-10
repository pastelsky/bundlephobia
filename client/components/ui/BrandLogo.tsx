import Link from 'next/link'
import React from 'react'

type BrandLogoProps = { href?: string; className?: string }

export function BrandLogo({ href = '/', className = '' }: BrandLogoProps) {
  return (
    <Link
      href={href}
      className={`ui-brand-logo ${className}`.trim()}
      aria-label="Bundlephobia home"
    >
      <span>Bundle</span>
      <span className="ui-brand-logo__alt">Phobia</span>
    </Link>
  )
}
