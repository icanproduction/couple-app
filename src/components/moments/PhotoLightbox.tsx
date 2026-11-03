'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import SignedPhoto from './SignedPhoto'

interface Props {
  photos: { url: string; storage_path: string }[]
  startIndex: number
  onClose: () => void
}

/** Full-screen photo viewer: swipe or arrow keys to move, Esc / X to close. */
export default function PhotoLightbox({ photos, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex)
  const touchX = useRef<number | null>(null)
  const count = photos.length
  // A live refresh can remove photos while the viewer is open: stay in range.
  const current = Math.min(index, count - 1)

  useEffect(() => {
    if (count === 0) onClose()
  }, [count, onClose])

  const go = useCallback((delta: number) => {
    if (count === 0) return
    setIndex((i) => (Math.min(i, count - 1) + delta + count) % count)
  }, [count])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [go, onClose])

  if (count === 0) return null
  const photo = photos[current]

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Foto moment"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">{current + 1} / {count}</span>
        <button onClick={onClose} aria-label="Tutup" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-8">
        <SignedPhoto
          src={photo.url}
          path={photo.storage_path}
          alt={`Foto ${current + 1}`}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        {count > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Foto sebelumnya"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Foto berikutnya"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
