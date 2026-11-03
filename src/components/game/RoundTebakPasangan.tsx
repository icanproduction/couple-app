'use client'

import { useState } from 'react'
import type { TebakPasanganConfig, PlayerRole } from '@/types/samakan'

interface RoundTebakPasanganProps {
  config: TebakPasanganConfig
  role: PlayerRole
  onSubmit: (answer: { real: string; guess: string }) => void
}

export default function RoundTebakPasangan({
  config, role, onSubmit,
}: RoundTebakPasanganProps) {
  const [phase, setPhase] = useState<1 | 2>(1)
  const [selfAnswer, setSelfAnswer] = useState('')
  const [guessAnswer, setGuessAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function selectSelf(opt: string) {
    setSelfAnswer(opt)
    // Auto-advance to phase 2 after short delay
    setTimeout(() => setPhase(2), 400)
  }

  function selectGuess(opt: string) {
    setGuessAnswer(opt)
    setSubmitted(true)
    onSubmit({ real: selfAnswer, guess: opt })
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 pt-14">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 w-full max-w-xs">
          <div className="mb-3">
            <p className="text-xs text-white/40 mb-1">Your answer</p>
            <p className="text-base text-white font-medium">{selfAnswer}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 mb-1">Your guess for your partner</p>
            <p className="text-base text-white font-medium">{guessAnswer}</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-white/40 animate-pulse">Waiting for your partner...</p>
      </div>
    )
  }

  const options = config.options ?? []

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 pt-14">
      {/* Phase indicator */}
      <div className="flex gap-2 mb-4">
        <div className={`h-1.5 w-8 rounded-full ${phase >= 1 ? 'bg-rose' : 'bg-white/20'}`} />
        <div className={`h-1.5 w-8 rounded-full ${phase >= 2 ? 'bg-rose' : 'bg-white/20'}`} />
      </div>

      <p className="mb-2 text-center text-lg font-semibold leading-relaxed text-white text-balance max-w-sm">
        {phase === 1 ? config.questionForSelf : config.questionForPartner}
      </p>
      <p className="mb-6 text-center text-xs text-white/40">
        {phase === 1 ? 'Pick your answer' : "Guess your partner's answer"}
      </p>

      {/* Multiple choice grid */}
      <div className="w-full max-w-xs space-y-2.5">
        {options.map(opt => {
          const selected = phase === 1 ? selfAnswer === opt : guessAnswer === opt
          return (
            <button
              key={opt}
              onClick={() => phase === 1 ? selectSelf(opt) : selectGuess(opt)}
              disabled={phase === 1 && !!selfAnswer}
              className={`flex w-full items-center justify-between rounded-xl border-2 px-5 py-3.5 text-left text-sm font-medium transition-all active:scale-[0.98] ${
                selected
                  ? 'border-rose bg-rose/20 text-white'
                  : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/30'
              }`}
            >
              <span>{opt}</span>
              {selected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
