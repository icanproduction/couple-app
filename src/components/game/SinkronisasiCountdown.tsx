'use client'

import { useState, useEffect, useRef } from 'react'

interface SinkronisasiCountdownProps {
  onComplete: () => void
}

export default function SinkronisasiCountdown({ onComplete }: SinkronisasiCountdownProps) {
  const [count, setCount] = useState(3)
  // Latest callback in a ref: a parent re-render must not restart the timer.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (count === 0) {
      const t = setTimeout(() => onCompleteRef.current(), 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCount(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-ink to-gray-900">
      <div
        key={count}
        className="animate-scale-in"
      >
        {count > 0 ? (
          <span className="text-8xl font-black text-white drop-shadow-lg">{count}</span>
        ) : (
          <span className="text-5xl font-black text-rose drop-shadow-lg">GO!</span>
        )}
      </div>
    </div>
  )
}
