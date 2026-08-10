import React, { useState, useEffect } from 'react'
import { IconButton } from '../ui'

const STORAGE_KEY = 'bundlephobia_rspack_banner_dismissed'
const EXPIRY_DATE = new Date('2026-07-18T00:00:00Z') // 6 months from January 18, 2026

export const AnnouncementBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if banner should be shown
    const now = new Date()

    // Don't show after expiry date
    if (now >= EXPIRY_DATE) {
      return
    }

    // Check if already dismissed
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (dismissed === 'true') {
        return
      }
    } catch (e) {
      // localStorage not available
    }

    setIsVisible(true)
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch (e) {
      // localStorage not available
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="announcement-banner">
      <div className="announcement-banner__content">
        <span className="announcement-banner__icon">🚀</span>
        <p className="announcement-banner__text">
          <strong>New:</strong> Now uses{' '}
          <a
            href="https://rspack.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            Rspack
          </a>{' '}
          — much faster results, better tree-shaking, accuracy and reliability !
        </p>
        <IconButton
          className="announcement-banner__close"
          onClick={handleDismiss}
          label="Dismiss announcement"
          variant="quiet"
        >
          ×
        </IconButton>
      </div>
    </div>
  )
}

export default AnnouncementBanner
