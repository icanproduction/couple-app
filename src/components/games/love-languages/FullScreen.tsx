'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A full-screen layer for the quiz, portaled to <body> so nothing on the page
 * (an animating parent, the bottom nav) can sit on top of it. Locks page
 * scroll while open; the layer scrolls on its own when needed.
 */
export function FullScreen({ children, label }: { children: React.ReactNode; label: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  if (!mounted) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-cream">
      <div className="relative flex min-h-full w-full max-w-lg flex-col">{children}</div>
    </div>,
    document.body,
  )
}
