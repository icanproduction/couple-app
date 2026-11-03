'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, Quote, Trophy, VenetianMask } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import StatementCard from './StatementCard'
import { ScoreBoard } from './RoundHistory'
import { GAME_PATH, cap, type Round, type Tally } from './logic'

interface RevealViewProps {
  /** A guessed round: lieIndex and guessIndex are known. */
  round: Round
  /** guesser = I guessed the partner's round; author = the partner guessed mine. */
  perspective: 'guesser' | 'author'
  partnerName: string
  /** Play the staggered reveal (right after a guess, or when the result arrives live). */
  animate: boolean
  tally: Tally
  /** I can start a new round right now (none open, couple not closed). */
  canWriteNew: boolean
}

// Truths get stamped first, the lie last, then the verdict lands.
const STAMP_START_MS = 350
const STAMP_GAP_MS = 380
const VERDICT_GAP_MS = 450

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function RevealView({ round, perspective, partnerName, animate, tally, canWriteNew }: RevealViewProps) {
  const router = useRouter()
  const lie = round.lieIndex ?? 0
  const guess = round.guessIndex ?? 0
  const correct = round.correct === true
  const them = cap(partnerName)
  // Order the stamps land in: truths in reading order, then the lie.
  const order = [0, 1, 2].filter((i) => i !== lie).concat(lie)

  const [step, setStep] = useState(animate ? 0 : order.length + 1)
  useEffect(() => {
    if (!animate || prefersReducedMotion()) {
      setStep(order.length + 1)
      return
    }
    const timers = order.map((_, k) => setTimeout(() => setStep(k + 1), STAMP_START_MS + k * STAMP_GAP_MS))
    timers.push(setTimeout(() => setStep(order.length + 1), STAMP_START_MS + (order.length - 1) * STAMP_GAP_MS + VERDICT_GAP_MS))
    return () => timers.forEach(clearTimeout)
    // Runs once per mount: a reload of the same round must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const done = step > order.length

  const won = perspective === 'guesser' ? correct : !correct
  const title = perspective === 'guesser'
    ? correct ? 'You spotted it!' : `${them} got you`
    : correct ? `${them} spotted your lie` : `You fooled ${partnerName}`
  const detail = perspective === 'guesser'
    ? correct ? `Number ${lie + 1} was the lie. ${them} couldn't fool you.` : `You picked number ${guess + 1}, which is true. The lie was number ${lie + 1}.`
    : correct ? `${them} went for number ${lie + 1}, the lie.` : `${them} picked number ${guess + 1}, which is true.`
  const pickTag = perspective === 'guesser' ? 'Your pick' : `${them}'s pick`

  return (
    <div className="px-6 pt-5">
      <div aria-live="polite" className="min-h-[5.5rem]">
        {done ? (
          <div className="flex items-start gap-3 animate-scale-in">
            <span
              className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', {
                'bg-gold/25 text-yellow-700': won,
                'bg-rose-50 text-rose': !won,
              })}
              aria-hidden="true"
            >
              {won ? <Trophy className="h-6 w-6" /> : <VenetianMask className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black leading-tight text-ink">{title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{detail}</p>
            </div>
          </div>
        ) : (
          <p className="pt-3 text-sm font-semibold text-ink-muted">And the lie is…</p>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {round.statements.map((text, i) => (
          <StatementCard
            key={i}
            index={i}
            text={text}
            selected={i === guess}
            verdict={i === lie ? 'lie' : 'truth'}
            stamped={step > order.indexOf(i)}
            tag={i === guess ? pickTag : null}
          />
        ))}
      </div>

      <div
        className={cn('mt-5 rounded-2xl border border-border bg-white p-4 shadow-card transition-all duration-500 motion-reduce:transition-none', {
          'translate-y-2 opacity-0': !done,
          'translate-y-0 opacity-100': done,
        })}
      >
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          <Quote className="h-3.5 w-3.5" aria-hidden="true" /> The story
        </p>
        {round.story ? (
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{round.story}</p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            {perspective === 'guesser' ? `No story this time. Ask ${partnerName} about it.` : 'You didn\'t add a story to this one.'}
          </p>
        )}
      </div>

      <div className={cn('mt-5 transition-opacity duration-500 motion-reduce:transition-none', { 'opacity-0': !done, 'opacity-100': done })}>
        <ScoreBoard tally={tally} partnerName={partnerName} />
      </div>

      <div className="mt-6 space-y-2">
        {canWriteNew && (
          <Button onClick={() => router.push(`${GAME_PATH}/new`)}>
            <PenLine className="h-4 w-4" aria-hidden="true" />
            {perspective === 'guesser' ? 'Write one back' : 'Write another'}
          </Button>
        )}
        <Button variant="secondary" onClick={() => router.push(GAME_PATH)}>
          Done
        </Button>
      </div>
    </div>
  )
}
