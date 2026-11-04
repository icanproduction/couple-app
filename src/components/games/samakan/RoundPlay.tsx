'use client'

// One round to answer: "Same page" (2 options), "Guess me" (pick + guess of
// 4) or "On a scale" (1-5, self + guess). Nothing is pre-selected and
// "Lock in" stays off until every required pick is made.

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { SCALE_MAX, SCALE_MIN, canLockIn, kindHint } from './logic'
import { SourceChip, cap } from './ui'
import type { SamakanRound } from '@/types/samakan'

export interface Picks {
  pick: number | null
  guess: number | null
}

interface RoundPlayProps {
  round: SamakanRound
  partner: string
  value: Picks
  onChange: (next: Picks) => void
  onLockIn: () => void
  onSkip: () => void
  canSkip: boolean
  skipsLeft: number
  busy: 'lock' | 'skip' | null
  online: boolean
  /** Changing an answer I already locked in. */
  editing: boolean
  onCancelEdit: () => void
  error: string | null
}

function OptionButton({
  selected, onClick, children, tall, disabled,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; tall?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full min-w-0 items-center justify-center rounded-2xl border-2 px-3 text-center text-sm font-semibold leading-snug transition-all active:scale-[0.98] disabled:opacity-60',
        tall ? 'min-h-[112px] py-4' : 'min-h-[56px] py-3',
        selected
          ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-card'
          : 'border-border bg-white text-ink hover:border-purple-200',
      )}
    >
      <span className="min-w-0 break-words">{children}</span>
    </button>
  )
}

function ScaleRow({
  label, value, onPick, disabled, labelId,
}: { label: string; value: number | null; onPick: (n: number) => void; disabled?: boolean; labelId: string }) {
  const steps = Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => SCALE_MIN + i)
  return (
    <div>
      <p id={labelId} className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex items-center justify-between gap-2">
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={String(n)}
            disabled={disabled}
            onClick={() => onPick(n)}
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold tabular-nums transition-all active:scale-95 disabled:opacity-60',
              value === n ? 'border-purple-500 bg-purple-500 text-white' : 'border-border bg-white text-ink hover:border-purple-200',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function RoundPlay({
  round, partner, value, onChange, onLockIn, onSkip, canSkip, skipsLeft, busy, online, editing, onCancelEdit, error,
}: RoundPlayProps) {
  const [confirmSkip, setConfirmSkip] = useState(false)
  const ready = canLockIn(round.kind, value.pick, round.kind === 'match' ? null : value.guess)
  const disabled = busy !== null
  const them = cap(partner)
  const groupId = `r-${round.id}`

  return (
    <div className="px-6 pt-5">
      <div className="space-y-2">
        <SourceChip source={round.source} />
        <h2 className="break-words text-xl font-bold leading-snug text-ink">{round.prompt}</h2>
        <p className="text-xs leading-relaxed text-ink-muted">{kindHint(round.kind, partner)}</p>
      </div>

      <div className="mt-5 space-y-5">
        {round.kind === 'match' && (
          <div role="radiogroup" aria-label="Your pick" className="grid grid-cols-2 gap-3">
            {round.options.map((opt, i) => (
              <OptionButton key={i} tall selected={value.pick === i} disabled={disabled} onClick={() => onChange({ pick: i, guess: null })}>
                {opt}
              </OptionButton>
            ))}
          </div>
        )}

        {round.kind === 'guess' && (
          <>
            <div>
              <p id={`${groupId}-you`} className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">You</p>
              <div role="radiogroup" aria-labelledby={`${groupId}-you`} className="grid grid-cols-2 gap-2.5">
                {round.options.map((opt, i) => (
                  <OptionButton key={i} selected={value.pick === i} disabled={disabled} onClick={() => onChange({ ...value, pick: i })}>
                    {opt}
                  </OptionButton>
                ))}
              </div>
            </div>
            <div>
              <p id={`${groupId}-guess`} className="mb-2 truncate text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Your guess for {them}
              </p>
              <div role="radiogroup" aria-labelledby={`${groupId}-guess`} className="grid grid-cols-2 gap-2.5">
                {round.options.map((opt, i) => (
                  <OptionButton key={i} selected={value.guess === i} disabled={disabled} onClick={() => onChange({ ...value, guess: i })}>
                    {opt}
                  </OptionButton>
                ))}
              </div>
            </div>
          </>
        )}

        {round.kind === 'scale' && (
          <>
            <div className="flex items-start justify-between gap-4 text-[11px] font-semibold leading-snug text-ink-light">
              <span className="max-w-[45%] break-words">1 · {round.low}</span>
              <span className="max-w-[45%] break-words text-right">{round.high} · 5</span>
            </div>
            <ScaleRow labelId={`${groupId}-you`} label="You" value={value.pick} disabled={disabled} onPick={(n) => onChange({ ...value, pick: n })} />
            <ScaleRow labelId={`${groupId}-guess`} label={`Your guess for ${them}`} value={value.guess} disabled={disabled} onPick={(n) => onChange({ ...value, guess: n })} />
          </>
        )}
      </div>

      {confirmSkip ? (
        <div className="mt-6 rounded-2xl border border-border bg-cream p-4 animate-fade-in">
          <p className="text-sm font-semibold text-ink">Skip this round for both of you?</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {skipsLeft <= 1 ? 'This is your last skip in this set.' : 'You can skip 2 rounds per set.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmSkip(false)} disabled={busy === 'skip'}>Keep it</Button>
            <Button size="sm" loading={busy === 'skip'} onClick={() => { onSkip(); setConfirmSkip(false) }}>Skip</Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-3">
          {editing ? (
            <button type="button" onClick={onCancelEdit} disabled={disabled} className="shrink-0 px-1 py-2 text-sm font-semibold text-ink-muted hover:text-ink disabled:opacity-50">
              Cancel
            </button>
          ) : canSkip ? (
            <button type="button" onClick={() => setConfirmSkip(true)} disabled={disabled} className="shrink-0 px-1 py-2 text-sm font-semibold text-ink-muted hover:text-ink disabled:opacity-50">
              Skip this one
            </button>
          ) : null}
          <Button className="ml-auto w-auto px-8" onClick={onLockIn} disabled={!ready || !online} loading={busy === 'lock'}>
            {editing ? 'Save change' : 'Lock in'}
          </Button>
        </div>
      )}

      {!online && ready && (
        <p role="status" className="mt-3 text-right text-xs text-ink-muted">Saved on this phone. It sends when you&apos;re back online.</p>
      )}
      {error && <p role="alert" className="mt-3 break-words text-xs font-medium text-rose-dark">{error}</p>}
    </div>
  )
}
