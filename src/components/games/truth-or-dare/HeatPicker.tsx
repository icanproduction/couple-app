'use client'

import { Check, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOD_HEATS, TOD_HEAT_INFO, type TodHeat } from './deck'

/** The three heats as large options (setup screen). */
export function HeatOptions({ value, onChange }: { value: TodHeat; onChange: (heat: TodHeat) => void }) {
  return (
    <div role="radiogroup" aria-label="Heat" className="space-y-2">
      {TOD_HEATS.map((heat, i) => {
        const info = TOD_HEAT_INFO[heat]
        const selected = value === heat
        return (
          <button
            key={heat}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(heat)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40',
              selected ? 'shadow-card' : 'border-border',
            )}
            style={selected ? { borderColor: info.color } : undefined}
          >
            <span
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: info.soft, color: info.color }}
              aria-hidden
            >
              <span className="flex">
                {Array.from({ length: i + 1 }, (_, n) => (
                  <Flame key={n} className={cn('h-3.5 w-3.5', { '-ml-1': n > 0 })} strokeWidth={2.5} />
                ))}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">{info.name}</span>
              <span className="block text-xs text-ink-muted">{info.line}</span>
            </span>
            <span
              className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-transparent text-white' : 'border-border',
              )}
              style={selected ? { backgroundColor: info.color } : undefined}
              aria-hidden
            >
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Compact heat switch used between turns. */
export function HeatChips({ value, onChange, disabled }: { value: TodHeat; onChange: (heat: TodHeat) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Heat for the next card" className="inline-flex rounded-full bg-white/80 p-1 shadow-card">
      {TOD_HEATS.map((heat) => {
        const info = TOD_HEAT_INFO[heat]
        const selected = value === heat
        return (
          <button
            key={heat}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(heat)}
            className={cn(
              'min-h-[36px] rounded-full px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:opacity-50',
              selected ? 'text-white' : 'text-ink-muted',
            )}
            style={selected ? { backgroundColor: info.color } : undefined}
          >
            {info.name}
          </button>
        )
      })}
    </div>
  )
}
