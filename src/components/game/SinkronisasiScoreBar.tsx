'use client'

import { X, Volume2, VolumeX } from 'lucide-react'

interface SinkronisasiScoreBarProps {
  currentRound: number
  totalRounds: number
  totalScore: number
  onClose: () => void
  muted?: boolean
  onToggleMute?: () => void
}

export default function SinkronisasiScoreBar({
  currentRound, totalRounds, totalScore, onClose,
  muted, onToggleMute,
}: SinkronisasiScoreBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between bg-black/40 backdrop-blur-sm px-4 py-3">
      {/* Round dots */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalRounds }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all ${
              i < currentRound
                ? 'bg-rose'
                : i === currentRound
                ? 'bg-rose animate-pulse scale-125'
                : 'bg-white/20 border border-white/30'
            }`}
          />
        ))}
      </div>

      {/* Score */}
      <div className="rounded-full bg-white/10 px-3 py-1">
        <span className="text-sm font-bold text-white">{totalScore}</span>
      </div>

      {/* Mute + Close */}
      <div className="flex items-center gap-1">
        {onToggleMute && (
          <button onClick={onToggleMute} aria-label={muted ? "Turn sound on" : "Mute sound"} className="rounded-full p-1.5 hover:bg-white/10 transition-colors">
            {muted
              ? <VolumeX className="h-4 w-4 text-white/40" />
              : <Volume2 className="h-4 w-4 text-white/60" />
            }
          </button>
        )}
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-white/10 transition-colors">
          <X className="h-5 w-5 text-white/60" />
        </button>
      </div>
    </div>
  )
}
