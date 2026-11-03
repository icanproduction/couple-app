'use client'

import { useState } from 'react'
import type { PilihSamaConfig } from '@/types/samakan'

interface RoundPilihSamaProps {
  config: PilihSamaConfig
  onSubmit: (selected: string) => void
  disabled?: boolean
}

export default function RoundPilihSama({ config, onSubmit, disabled }: RoundPilihSamaProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelect = (option: string) => {
    if (disabled || selected) return
    setSelected(option)
    onSubmit(option)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 pt-14">
      <p className="mb-8 text-center text-lg font-medium text-white/90 leading-relaxed max-w-sm">
        {config.storyPrompt}
      </p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {config.options.map((option) => {
          const isSelected = selected === option
          return (
            <button
              key={option}
              onClick={() => handleSelect(option)}
              disabled={disabled || !!selected}
              className={`rounded-2xl border-2 px-4 py-5 text-center text-base font-semibold transition-all ${
                isSelected
                  ? 'border-rose bg-rose/20 text-white ring-2 ring-rose/40 scale-105'
                  : selected
                  ? 'border-white/10 bg-white/5 text-white/30'
                  : 'border-white/20 bg-white/10 text-white hover:border-white/40 active:scale-95'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>

      {selected && (
        <p className="mt-6 text-sm text-white/40 animate-pulse">Waiting for your partner...</p>
      )}
    </div>
  )
}
