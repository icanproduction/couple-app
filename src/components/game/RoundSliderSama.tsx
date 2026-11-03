'use client'

import { useState } from 'react'
import type { SliderSamaConfig } from '@/types/samakan'

interface RoundSliderSamaProps {
  config: SliderSamaConfig
  onSubmit: (value: number) => void
  disabled?: boolean
}

export default function RoundSliderSama({ config, onSubmit, disabled }: RoundSliderSamaProps) {
  const [value, setValue] = useState(5)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (submitted || disabled) return
    setSubmitted(true)
    onSubmit(value)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pt-16">
      <p className="mb-8 text-center text-lg font-semibold leading-relaxed text-white text-balance">
        {config.question}
      </p>

      {/* Big number display */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
        <span className="text-5xl font-extrabold text-white">{value}</span>
      </div>

      {/* Slider */}
      <div className="mb-3 w-full max-w-xs px-2">
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={e => !submitted && setValue(Number(e.target.value))}
          disabled={submitted || disabled}
          className="w-full accent-white"
        />
      </div>

      {/* Labels */}
      <div className="mb-8 flex w-full max-w-xs justify-between px-2">
        <span className="text-xs text-white/50">{config.minLabel}</span>
        <span className="text-xs text-white/50">{config.maxLabel}</span>
      </div>

      {/* Submit */}
      {!submitted ? (
        <button
          onClick={handleSubmit}
          className="rounded-full bg-white/20 px-10 py-3 text-base font-bold text-white backdrop-blur-sm transition-all active:scale-95 hover:bg-white/30"
        >
          Pick {value}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-sm text-white/50">Waiting for your partner...</p>
        </div>
      )}
    </div>
  )
}
