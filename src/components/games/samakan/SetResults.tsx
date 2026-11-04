'use client'

// Results of a set: the totals, the read-out, then every round with both
// picks and both guesses. An ended or expired set shows only the rounds you
// both answered; a one-sided answer is never shown.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Trophy } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { requestReadout } from '@/lib/samakan'
import { GAME_PATH, resultLine, scoreSet, templateReadout } from './logic'
import { RevealRows, roundSummary } from './RoundReveal'
import { SectionLabel, cap } from './ui'
import type { SamakanReadout, SamakanSetState } from '@/types/samakan'

interface SetResultsProps {
  state: SamakanSetState
  me: string
  partnerName: string
}

export default function SetResults({ state, me, partnerName }: SetResultsProps) {
  const { set, rounds, isBest } = state
  // The server's totals; a set from before they were stored falls back to a recount.
  const recount = scoreSet(rounds)
  const totals = set.maxMatches > 0 || set.revealed === 0
    ? { matches: set.matches, max: set.maxMatches, learned: set.learned }
    : recount
  const done = set.status === 'done'
  const [readout, setReadout] = useState<SamakanReadout | null>(set.readout)
  const [asking, setAsking] = useState(false)
  const asked = useRef(false)
  const mounted = useRef(true)
  const roundsRef = useRef(rounds)
  roundsRef.current = rounds

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Keep a read-out that lands through realtime (the partner's phone wrote it).
  useEffect(() => {
    if (!set.readout) return
    setReadout(set.readout)
    setAsking(false)
  }, [set.readout])

  // A finished set with no read-out yet: ask once (the server claims it, so
  // both phones asking is fine). If the other phone is writing it, wait for
  // realtime; the template fills in after 15 s, or right away on a failure.
  useEffect(() => {
    if (!done || set.readout || asked.current) return
    asked.current = true
    setAsking(true)
    const fallBack = () => {
      if (!mounted.current) return
      setReadout((cur) => cur ?? templateReadout(roundsRef.current))
      setAsking(false)
    }
    void requestReadout(set.id).then((r) => {
      if (!mounted.current) return
      if (r.readout) {
        setReadout(r.readout)
        setAsking(false)
      } else if (r.pending) {
        setTimeout(fallBack, 15_000)
      } else {
        fallBack()
      }
    })
  }, [done, set.id, set.readout])

  const them = cap(partnerName)
  const shown = rounds.filter((r) => !r.skipped && r.revealed && r.mine && r.partner)
  const skipped = rounds.filter((r) => r.skipped)
  const oneSided = rounds.filter((r) => !r.skipped && !(r.revealed && r.mine && r.partner)).length
  const skipperName = (id: string | null) => (id === me ? 'you' : them)

  return (
    <div className="space-y-6 px-6 pt-5 pb-2">
      {(set.status === 'ended' || set.status === 'expired') && (
        <p role="status" className="rounded-2xl border border-border bg-cream px-4 py-3 text-xs leading-relaxed text-ink-light">
          {set.status === 'expired'
            ? 'This set ran out after 7 days. Rounds you both answered are below.'
            : 'This set ended. Rounds you both answered are below.'}
        </p>
      )}

      <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 p-5 text-white shadow-elevated">
        <p className="text-3xl font-bold tabular-nums leading-tight">
          {totals.matches} of {totals.max}
          <span className="ml-2 text-base font-semibold text-white/85">{totals.max === 1 ? 'match' : 'matches'}</span>
        </p>
        {totals.learned > 0 && (
          <p className="mt-1 text-sm text-white/90">
            {totals.learned} new {totals.learned === 1 ? 'thing' : 'things'} you learned about each other
          </p>
        )}
        {isBest && done && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Your best set so far
          </p>
        )}
      </div>

      {done && (
        <div
          className={cn(readout?.by === 'template' && !asking ? '' : 'rounded-2xl border border-border bg-white p-5 shadow-card')}
          aria-busy={asking}
        >
          {asking && !readout ? (
            <div aria-label="Writing your read-out">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
              <p className="mt-3 text-xs text-ink-muted">Writing your read-out...</p>
            </div>
          ) : readout ? (
            <>
              {/* The template's headline repeats the score card above, so only Claude's read gets one. */}
              {readout.by === 'ai' && (
                <>
                  <p className="break-words text-base font-bold leading-snug text-ink">{readout.headline}</p>
                  <p className="mt-1.5 break-words text-sm leading-relaxed text-ink-light">{readout.note}</p>
                </>
              )}
              <div className={cn('rounded-xl bg-purple-50/70', readout.by === 'ai' ? 'mt-4 p-3' : 'border border-purple-100 p-4')}>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-700">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Talk about it
                </p>
                <p className="mt-1 break-words text-sm leading-relaxed text-ink">{readout.ask}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-light">{resultLine(totals.matches, totals.max, totals.learned)}</p>
          )}
        </div>
      )}

      <div>
        <SectionLabel>Round by round</SectionLabel>
        {shown.length === 0 && (
          <p className="rounded-2xl border border-border bg-white px-4 py-4 text-sm text-ink-muted">
            No round was answered by both of you.
          </p>
        )}
        <ol className="space-y-3">
          {rounds.map((r) => {
            if (r.skipped) {
              return (
                <li key={r.id} className="rounded-2xl border border-dashed border-border px-4 py-3">
                  <p className="flex items-baseline gap-2 text-sm text-ink-muted">
                    <span className="shrink-0 tabular-nums font-bold">{r.position + 1}</span>
                    <span className="min-w-0 break-words">{r.prompt}</span>
                  </p>
                  <p className="mt-1 pl-5 text-xs text-ink-muted">Skipped by {skipperName(r.skippedBy)}</p>
                </li>
              )
            }
            if (!(r.revealed && r.mine && r.partner)) return null
            const summary = roundSummary(r, r.mine, r.partner)
            const same = r.kind === 'match' && r.mine.pick === r.partner.pick
            return (
              <li key={r.id} className="rounded-2xl border border-border bg-white p-4 shadow-card">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-purple-600">{r.position + 1}</span>
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-ink">{r.prompt}</p>
                </div>
                <p className={cn('mt-1 pl-5 text-xs font-semibold', r.kind === 'match' ? (same ? 'text-sage-dark' : 'text-yellow-800') : 'text-ink-muted')}>
                  {summary}
                </p>
                <div className="mt-3">
                  <RevealRows round={r} mine={r.mine} partner={r.partner} partnerName={partnerName} compact />
                </div>
              </li>
            )
          })}
        </ol>
        {!done && oneSided > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            {oneSided === 1 ? '1 round wasn\'t' : `${oneSided} rounds weren't`} answered by both of you, so {oneSided === 1 ? 'it stays' : 'they stay'} hidden.
          </p>
        )}
        {skipped.length > 0 && done && (
          <p className="mt-3 text-xs text-ink-muted">Skipped rounds don&apos;t count toward the total.</p>
        )}
      </div>

      <div className="flex gap-3">
        <Link href={GAME_PATH} className={buttonVariants({ variant: 'secondary' })}>Done</Link>
        <Link href={`${GAME_PATH}#start`} className={buttonVariants()}>Another set</Link>
      </div>
    </div>
  )
}
