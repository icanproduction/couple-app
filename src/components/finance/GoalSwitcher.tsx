'use client'

import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtRpShort } from '@/lib/finance'

export interface GoalSummary {
  id: string
  name: string
  current_amount: number
  target_amount: number
}

interface GoalSwitcherProps {
  goals: GoalSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

/** Horizontal cards, one per savings goal, with progress (F07). */
export default function GoalSwitcher({ goals, selectedId, onSelect, onAdd }: GoalSwitcherProps) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2.5" role="group" aria-label="Choose a savings goal">
        {goals.map(g => {
          const target = Number(g.target_amount)
          const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((Number(g.current_amount) / target) * 100))) : 0
          const active = g.id === selectedId
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(g.id)}
              className={cn(
                'w-36 flex-shrink-0 rounded-2xl border p-3 text-left shadow-card transition-all active:scale-[0.98]',
                active ? 'border-rose bg-rose/5 ring-1 ring-rose/30' : 'border-border bg-white hover:border-rose/40',
              )}
            >
              <p className={cn('truncate text-xs font-bold', active ? 'text-rose' : 'text-ink')}>{g.name}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {fmtRpShort(Number(g.current_amount))} <span className="text-ink-muted/60">/ {fmtRpShort(target)}</span>
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div className={cn('h-full rounded-full', active ? 'bg-rose' : 'bg-sage')} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[10px] font-semibold text-ink-muted">{pct}%</p>
            </button>
          )
        })}
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add a savings goal"
          className="flex w-24 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-rose/40 bg-white p-3 text-rose transition-all hover:bg-rose/5 active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          <span className="text-[11px] font-semibold">New goal</span>
        </button>
      </div>
    </div>
  )
}
