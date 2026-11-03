'use client'

import { useState } from 'react'
import type { TebakAngkaConfig } from '@/types/samakan'

interface RoundTebakAngkaProps {
  config: TebakAngkaConfig
  onSubmit: (value: number) => void
  disabled?: boolean
}

export default function RoundTebakAngka({ config, onSubmit, disabled }: RoundTebakAngkaProps) {
  const [value, setValue] = useState(5)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (submitted || disabled) return
    setSubmitted(true)
    onSubmit(value)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pt-16">
      <p className="mb-2 text-center text-lg font-semibold leading-relaxed text-white text-balance">
        {config.question}
      </p>
      <p className="mb-8 text-center text-sm text-white/50">
        Coba pilih angka yang sama dengan pasanganmu!
      </p>

      {/* Number grid — fluid cells so 5 columns fit 320–375px screens */}
      <div className="mb-8 grid w-full max-w-xs grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
          <button
            key={num}
            onClick={() => !submitted && setValue(num)}
            disabled={submitted || disabled}
            className={`flex aspect-square w-full items-center justify-center rounded-2xl text-lg font-bold transition-all sm:text-xl ${
              value === num
                ? 'bg-white text-ink scale-105 shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Submit */}
      {!submitted ? (
        <button
          onClick={handleSubmit}
          className="rounded-full bg-white/20 px-10 py-3 text-base font-bold text-white backdrop-blur-sm transition-all active:scale-95 hover:bg-white/30"
        >
          Pilih {value}!
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-sm text-white/50">Menunggu pasangan...</p>
        </div>
      )}
    </div>
  )
}
