'use client'

import { Check, X, Minus, ArrowLeft, RotateCcw } from 'lucide-react'
import type { RoundResult, RoundType } from '@/types/samakan'
import { getRoundVerdict, type RoundTone } from '@/lib/samakan'

const TONE_TEXT: Record<RoundTone, string> = {
  match: 'text-emerald-400',
  close: 'text-amber-400',
  miss: 'text-red-400',
}

interface SinkronisasiResultsProps {
  totalScore: number
  results: RoundResult[]
  ending: string
  chapterTitle: string
  onPlayAgain: () => void
  onBack: () => void
}

const ROUND_TYPE_LABELS: Record<RoundType, string> = {
  pilih_sama: 'Same pick',
  slider_sama: 'Slider',
  tebak_angka: 'Number match',
  tebak_pasangan: 'Guess your partner',
}

const ROUND_TYPE_EMOJI: Record<RoundType, string> = {
  pilih_sama: '🎯',
  slider_sama: '📊',
  tebak_angka: '🔢',
  tebak_pasangan: '🔮',
}

export default function SinkronisasiResults({
  totalScore,
  results,
  ending,
  chapterTitle,
  onPlayAgain,
  onBack,
}: SinkronisasiResultsProps) {
  const maxScore = results.length * 20
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0
  const circumference = 2 * Math.PI * 54
  const offset = circumference * (1 - percentage / 100)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-ink to-gray-900">
      <div className="flex flex-col items-center px-6 py-10">
        {/* Chapter title */}
        <p className="text-sm text-white/40 mb-2">{chapterTitle}</p>

        {/* Story ending */}
        <p className="mb-8 text-center text-base text-white/80 leading-relaxed max-w-sm">
          {ending}
        </p>

        {/* Score ring */}
        <div className="relative mb-8">
          <svg width="128" height="128" className="-rotate-90">
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="8"
            />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke={percentage >= 80 ? '#34d399' : percentage >= 50 ? '#fbbf24' : '#f87171'}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-white">{percentage}%</span>
            <span className="text-xs text-white/40">{totalScore}/{maxScore}</span>
          </div>
        </div>

        {/* Per-round breakdown */}
        <div className="w-full max-w-sm mb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">
            Round by round
          </p>
          <div className="space-y-2">
            {results.map((result, i) => {
              const tone = getRoundVerdict(result).tone
              return (
              <div
                key={result.roundIndex ?? i}
                className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{ROUND_TYPE_EMOJI[result.type]}</span>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {ROUND_TYPE_LABELS[result.type]}
                    </p>
                    <p className="text-xs text-white/40">Round {i + 1}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${TONE_TEXT[tone]}`}>
                    +{result.score}
                  </span>
                  {tone === 'match' ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : tone === 'close' ? (
                    <Minus className="h-4 w-4 text-amber-400" />
                  ) : (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full max-w-sm">
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/20 py-3 text-sm font-medium text-white/70 active:scale-95 transition-transform"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={onPlayAgain}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose py-3 text-sm font-bold text-white active:scale-95 transition-transform shadow-lg shadow-rose/20"
          >
            <RotateCcw className="h-4 w-4" />
            Play again
          </button>
        </div>
      </div>
    </div>
  )
}
