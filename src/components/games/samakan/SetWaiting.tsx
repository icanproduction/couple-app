'use client'

// The calm screens between answers: "Locked in" after a round the partner
// hasn't answered yet, and "You're done" when I finished first. Waiting is
// never a dead end: there is always a next step, a reveal to look at, a
// nudge, or "Play now together".

import Link from 'next/link'
import { BellRing, Check, Eye, Hourglass, Radio } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GAME_PATH } from './logic'
import { cap, clockTime } from './ui'

export function PlayNowButton({
  partner, busy, onClick, pendingInvite,
}: { partner: string; busy: boolean; onClick: () => void; pendingInvite: boolean }) {
  if (pendingInvite) {
    return (
      <p role="status" className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" aria-hidden="true" />
        <span className="min-w-0 break-words">Asked {cap(partner)} to open this set now. The invite lasts 10 minutes.</span>
      </p>
    )
  }
  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={onClick}>
      <Radio className="h-4 w-4" aria-hidden="true" /> Play now together
    </Button>
  )
}

interface LockedCardProps {
  partner: string
  partnerHere: boolean
  canChange: boolean
  onChange: () => void
  nextLabel: string
  onNext: () => void
  children?: React.ReactNode
}

/** After Lock in, when the partner hasn't answered this round yet. */
export function LockedCard({ partner, partnerHere, canChange, onChange, nextLabel, onNext, children }: LockedCardProps) {
  const them = cap(partner)
  return (
    <div className="px-6 pt-6">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-card animate-fade-in">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600" aria-hidden="true">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-3 text-base font-bold text-ink">Locked in.</p>
        <p className="mt-1 break-words text-sm leading-relaxed text-ink-light">
          {partnerHere
            ? `${them} is answering this one now. The reveal opens the moment ${them} locks in.`
            : `${them} hasn't answered this one yet. Keep going, the reveal waits for you.`}
        </p>
        <div className="mt-5 flex items-center gap-3">
          {canChange && (
            <button type="button" onClick={onChange} className="shrink-0 px-1 py-2 text-sm font-semibold text-ink-muted hover:text-ink">
              Change answer
            </button>
          )}
          <Button className="ml-auto w-auto px-8" onClick={onNext}>{nextLabel}</Button>
        </div>
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  )
}

interface WaitingCardProps {
  partner: string
  partnerHere: boolean
  partnerAnswered: number
  total: number
  revealedCount: number
  onSeeReveals: () => void
  /** When the one nudge opens; null once it's spent or not needed. */
  nudgeAt: Date | null
  nudged: boolean
  now: Date | null
  nudging: boolean
  onNudge: () => void
  onEnd: () => void
  children?: React.ReactNode
}

/** I answered every round; the partner hasn't yet. */
export function WaitingCard({
  partner, partnerHere, partnerAnswered, total, revealedCount, onSeeReveals,
  nudgeAt, nudged, now, nudging, onNudge, onEnd, children,
}: WaitingCardProps) {
  const them = cap(partner)
  const nudgeOpen = !!nudgeAt && !!now && now.getTime() >= nudgeAt.getTime()
  return (
    <div className="space-y-4 px-6 pt-6">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-card animate-fade-in">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600" aria-hidden="true">
          <Hourglass className="h-5 w-5" />
        </span>
        <p className="mt-3 text-base font-bold text-ink">You&apos;re done.</p>
        <p className="mt-1 break-words text-sm leading-relaxed text-ink-light">
          {them} has answered {partnerAnswered} of {total}.{' '}
          {partnerHere
            ? 'Each round opens here as soon as it gets answered.'
            : `We'll tell you when ${them} is done.`}
        </p>
        <div className="mt-5 space-y-2">
          {revealedCount > 0 && (
            <Button onClick={onSeeReveals}>
              <Eye className="h-4 w-4" aria-hidden="true" /> See {revealedCount} {revealedCount === 1 ? 'reveal' : 'reveals'}
            </Button>
          )}
          {!nudged && nudgeAt && (
            nudgeOpen ? (
              <Button variant="secondary" loading={nudging} onClick={onNudge}>
                <BellRing className="h-4 w-4" aria-hidden="true" /> Nudge {them}
              </Button>
            ) : now ? (
              <p className="pt-1 text-center text-xs text-ink-muted">You can nudge {them} from {clockTime(nudgeAt, now)}.</p>
            ) : null
          )}
          {nudged && <p className="pt-1 text-center text-xs text-ink-muted">Nudge sent.</p>}
        </div>
      </div>
      {children}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Link href={GAME_PATH} className="shrink-0 px-1 py-2 text-xs font-semibold text-ink-muted hover:text-ink">Back to Samakan</Link>
        <button type="button" onClick={onEnd} className="shrink-0 px-1 py-2 text-xs font-semibold text-ink-muted hover:text-ink">
          End set
        </button>
      </div>
    </div>
  )
}
