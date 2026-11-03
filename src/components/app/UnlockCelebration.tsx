'use client'

import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'

interface Props {
  levelNumber: number
  levelTitle: string
  questionCount: number
  onDismiss: () => void
}

export default function UnlockCelebration({ levelNumber, levelTitle, questionCount, onDismiss }: Props) {
  // Keep the latest callback in a ref so a parent re-render (new inline
  // function) does not restart the auto-dismiss timer.
  const onDismissRef = useRef(onDismiss)
  useEffect(() => { onDismissRef.current = onDismiss }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), 1800)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={() => onDismissRef.current()}
    >
      <div className="flex flex-col items-center px-8 text-center text-white animate-scale-in">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-rose/40 animate-ping" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-rose to-rose-dark shadow-glow">
            <Sparkles className="h-12 w-12 text-white" strokeWidth={1.5} />
          </div>
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">New level</p>
        <h2 className="mt-2 text-3xl font-extrabold drop-shadow-md">Level {levelNumber}</h2>
        <p className="mt-1 text-lg font-bold text-white/90">{levelTitle}</p>
        <p className="mt-3 text-sm text-white/70">
          {questionCount} new {questionCount === 1 ? 'question is' : 'questions are'} waiting
        </p>
      </div>
    </div>
  )
}
