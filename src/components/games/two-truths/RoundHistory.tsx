'use client'

import Link from 'next/link'
import { Check, ChevronRight, VenetianMask } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GAME_PATH, cap, possessive, roundDate, tallyLine, type Round, type Tally } from './logic'

/** Two tiles: how often each of you spotted the other's lie. */
export function ScoreBoard({ tally, partnerName }: { tally: Tally; partnerName: string }) {
  const tiles = [
    { key: 'you', who: 'You', side: tally.you },
    { key: 'partner', who: cap(partnerName), side: tally.partner },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map(({ key, who, side }) => {
        const pct = side.guessed ? Math.round((side.spotted / side.guessed) * 100) : 0
        return (
          <div key={key} className="min-w-0 rounded-2xl border border-border bg-white p-4 shadow-card" aria-label={tallyLine(side, who)}>
            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-ink-muted">{who}</p>
            {side.guessed ? (
              <>
                <p className="mt-1 text-2xl font-black leading-none text-ink">
                  {side.spotted}
                  <span className="text-sm font-bold text-ink-muted"> of {side.guessed}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">lies spotted</p>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                  <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold text-ink-light">No guesses yet</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One line per guessed round, both ways, newest first. */
export function HistoryList({ rounds, partnerName }: { rounds: readonly Round[]; partnerName: string }) {
  const them = cap(partnerName)
  return (
    <ul className="space-y-2">
      {rounds.map((r) => {
        const spotted = r.correct === true
        const label = r.mine
          ? spotted ? `${them} spotted your lie` : `You fooled ${partnerName}`
          : spotted ? `You spotted ${possessive(partnerName)} lie` : `${them} fooled you`
        const lie = r.lieIndex !== null ? r.statements[r.lieIndex] : null
        const iWon = r.mine ? !spotted : spotted
        const Icon = spotted ? Check : VenetianMask
        return (
          <li key={r.id}>
            <Link
              href={`${GAME_PATH}/${r.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-card transition-all hover:border-sky-200 active:scale-[0.99]"
            >
              <span
                className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', {
                  'bg-sage/15 text-sage-dark': iWon,
                  'bg-rose-50 text-rose': !iWon,
                })}
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                {lie && <span className="mt-0.5 block truncate text-xs text-ink-muted">The lie: “{lie}”</span>}
              </span>
              <span className="shrink-0 text-[11px] text-ink-muted">{roundDate(r.guessedAt ?? r.createdAt)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
