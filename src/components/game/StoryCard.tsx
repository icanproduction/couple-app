'use client'

import { useState, useEffect, useRef } from 'react'

interface StoryCardProps {
  text: string
  gradient?: string
  onNext: () => void
  /** Replaces "Tap to continue", e.g. when the partner controls the pace */
  hint?: string
}

export default function StoryCard({ text, gradient, onNext, hint }: StoryCardProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const indexRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    indexRef.current = 0
    setDisplayedText('')
    setIsComplete(false)

    intervalRef.current = setInterval(() => {
      indexRef.current++
      if (indexRef.current >= text.length) {
        setDisplayedText(text)
        setIsComplete(true)
        if (intervalRef.current) clearInterval(intervalRef.current)
      } else {
        setDisplayedText(text.slice(0, indexRef.current))
      }
    }, 30)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text])

  const handleTap = () => {
    if (!isComplete) {
      // Skip to full text
      if (intervalRef.current) clearInterval(intervalRef.current)
      setDisplayedText(text)
      setIsComplete(true)
    } else {
      onNext()
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-8 ${
        gradient ?? 'bg-gradient-to-br from-ink to-gray-900'
      }`}
      onClick={handleTap}
    >
      <div className="max-w-md text-center">
        <p className="text-lg leading-relaxed text-white/90 font-medium">
          {displayedText}
          {!isComplete && (
            <span className="inline-block w-0.5 h-5 bg-white/60 ml-0.5 animate-pulse" />
          )}
        </p>
      </div>

      {isComplete && (
        <div className="absolute bottom-12 animate-pulse">
          <p className="text-sm text-white/50">{hint ?? 'Tap to continue'}</p>
        </div>
      )}
    </div>
  )
}
