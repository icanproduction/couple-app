'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, X, Minus } from 'lucide-react'
import type { RoundResult } from '@/types/samakan'
import { getRoundVerdict, type RoundTone } from '@/lib/samakan'

interface SinkronisasiRevealProps {
  result: RoundResult
  hostName: string
  guestName: string
  /** Optional: called once after the reveal has been on screen for 3.5s */
  onNext?: () => void
}

const TONE_STYLE: Record<RoundTone, { ring: string; icon: string; score: string }> = {
  match: { ring: 'bg-emerald-500/20', icon: 'text-emerald-400', score: 'text-emerald-400' },
  close: { ring: 'bg-amber-500/20', icon: 'text-amber-400', score: 'text-amber-400' },
  miss: { ring: 'bg-red-500/20', icon: 'text-red-400', score: 'text-red-400' },
}

function formatAnswer(answer: unknown): string {
  if (answer == null) return '...'
  if (typeof answer === 'string') return answer
  if (typeof answer === 'number') return String(answer)
  if (typeof answer === 'object') {
    const obj = answer as Record<string, unknown>
    if ('real' in obj && 'guess' in obj) {
      return `Jawab: ${obj.real} · Tebak: ${obj.guess}`
    }
  }
  return String(answer)
}

export default function SinkronisasiReveal({ result, hostName, guestName, onNext }: SinkronisasiRevealProps) {
  const [showScore, setShowScore] = useState(false)
  // Latest callback in a ref: parent re-renders must not restart the timers.
  const onNextRef = useRef(onNext)
  useEffect(() => { onNextRef.current = onNext }, [onNext])

  useEffect(() => {
    const t1 = setTimeout(() => setShowScore(true), 600)
    const t2 = setTimeout(() => onNextRef.current?.(), 3500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const verdict = getRoundVerdict(result)
  const style = TONE_STYLE[verdict.tone]
  const Icon = verdict.tone === 'match' ? Check : verdict.tone === 'close' ? Minus : X

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-ink to-gray-900 px-6">
      {/* Match indicator */}
      <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full animate-scale-in ${style.ring}`}>
        <Icon className={`h-8 w-8 ${style.icon}`} strokeWidth={3} />
      </div>

      <p className="mb-8 text-sm font-medium text-white/50">{verdict.label}</p>

      {/* Answers side by side */}
      <div className="flex w-full max-w-sm gap-3 mb-8">
        <div className="flex-1 rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
          <p className="text-xs text-white/40 mb-2">{hostName}</p>
          <p className="text-base font-semibold text-white break-words">
            {formatAnswer(result.hostAnswer)}
          </p>
        </div>
        <div className="flex-1 rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
          <p className="text-xs text-white/40 mb-2">{guestName}</p>
          <p className="text-base font-semibold text-white break-words">
            {formatAnswer(result.guestAnswer)}
          </p>
        </div>
      </div>

      {/* Score */}
      {showScore && (
        <div className="animate-scale-in">
          <span className={`text-4xl font-black ${style.score}`}>+{result.score}</span>
        </div>
      )}
    </div>
  )
}
