'use client'

// The reveal of one round: both picks, both guesses, how each guess landed,
// and a line to talk about. It stays on screen until Next. Differences read
// as news ("New to you"), never as a red X.

import { MessageCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { MARK_LABELS, revealRound } from './logic'
import { MarkChip, SourceChip, cap, firstName, valueText } from './ui'
import type { SamakanAnswer, SamakanMark, SamakanRound } from '@/types/samakan'

interface Who {
  /** "You" for me, the partner's name for them. */
  label: string
  pick: string
  /** How the other person's guess of this pick landed. */
  guess: { text: string; mark: SamakanMark; markText: string } | null
}

function scaleDots(pick: number, guess: number | null) {
  return (
    <span className="mt-2 flex items-center gap-1.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
            n === pick ? 'bg-purple-500 text-white' : 'bg-border/60 text-ink-muted',
            guess === n && n !== pick && 'ring-2 ring-gold-dark ring-offset-1',
            guess === n && n === pick && 'ring-2 ring-sage ring-offset-1',
          )}
        >
          {n}
        </span>
      ))}
    </span>
  )
}

/** Both people's picks and guesses for a revealed round, from my side. */
export function revealPeople(round: SamakanRound, mine: SamakanAnswer, partner: SamakanAnswer, partnerName: string): { me: Who; them: Who } {
  const r = revealRound(round.kind, mine, partner)
  // Rows and chips are tight: the first name is enough there.
  const them = cap(firstName(partnerName))
  const guessLine =(mark: SamakanMark | null, guesser: 'me' | 'them', guess: number | null): Who['guess'] => {
    if (!mark || guess === null) return null
    if (guesser === 'them') {
      return {
        text: mark === 'right' ? `${them} guessed it` : `${them} guessed ${valueText(round, guess)}`,
        mark,
        markText: mark === 'right' ? MARK_LABELS.right : mark === 'close' ? MARK_LABELS.close : `New to ${them}`,
      }
    }
    return {
      text: mark === 'right' ? 'You guessed it' : `You guessed ${valueText(round, guess)}`,
      mark,
      markText: mark === 'right' ? `Read ${them} right` : mark === 'close' ? MARK_LABELS.close : MARK_LABELS.new,
    }
  }
  return {
    me: { label: 'You', pick: valueText(round, mine.pick), guess: guessLine(r.partnerGuess, 'them', partner.guess) },
    them: { label: them, pick: valueText(round, partner.pick), guess: guessLine(r.myGuess, 'me', mine.guess) },
  }
}

/** "1 match, 1 new thing learned" */
export function roundSummary(round: SamakanRound, mine: SamakanAnswer, partner: SamakanAnswer): string {
  const r = revealRound(round.kind, mine, partner)
  if (round.kind === 'match') return r.samePick ? MARK_LABELS.same : MARK_LABELS.different
  const matches = `${r.score} ${r.score === 1 ? 'match' : 'matches'}`
  if (r.learned <= 0) return matches
  return `${matches}, ${r.learned} new ${r.learned === 1 ? 'thing' : 'things'} learned`
}

/** The rows of a reveal. compact: the smaller version in results. */
export function RevealRows({
  round, mine, partner, partnerName, compact = false, animate = false,
}: { round: SamakanRound; mine: SamakanAnswer; partner: SamakanAnswer; partnerName: string; compact?: boolean; animate?: boolean }) {
  const people = revealPeople(round, mine, partner, partnerName)
  const same = round.kind === 'match' && mine.pick === partner.pick
  const rows: { who: Who; pickN: number; guessN: number | null }[] = [
    { who: people.me, pickN: mine.pick, guessN: partner.guess },
    { who: people.them, pickN: partner.pick, guessN: mine.guess },
  ]
  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
      {rows.map(({ who, pickN, guessN }, i) => (
        <div
          key={who.label + i}
          style={animate ? { animationDelay: `${150 + i * 350}ms`, animationFillMode: 'backwards' } : undefined}
          className={cn(
            'rounded-2xl border bg-white',
            compact ? 'border-border/70 px-3 py-2.5' : 'border-border p-4 shadow-card',
            animate && 'animate-slide-up motion-reduce:animate-none',
            round.kind === 'match' && same && !compact && 'border-sage/40',
          )}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className={cn('min-w-0 max-w-full truncate font-bold uppercase tracking-wider text-ink-muted', compact ? 'text-[10px]' : 'text-[11px]')}>
              {who.label}
            </span>
            <span className={cn('min-w-0 break-words font-semibold text-ink', compact ? 'text-sm' : 'text-base')}>{who.pick}</span>
          </div>
          {round.kind === 'scale' && !compact && scaleDots(pickN, guessN)}
          {who.guess && (
            <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', compact ? 'mt-1' : 'mt-2')}>
              <span className="min-w-0 break-words text-xs text-ink-light">{who.guess.text}</span>
              <MarkChip mark={who.guess.mark}>{who.guess.markText}</MarkChip>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface RoundRevealProps {
  round: SamakanRound
  partnerName: string
  /** It opened while I was watching: a little ceremony. */
  live: boolean
  nextLabel: string
  onNext: () => void
  /** Walking through a finished set: a way straight to the results. */
  onSkipToResults?: () => void
}

export default function RoundReveal({ round, partnerName, live, nextLabel, onNext, onSkipToResults }: RoundRevealProps) {
  if (!round.mine || !round.partner) return null
  const mine = round.mine
  const partner = round.partner
  const r = revealRound(round.kind, mine, partner)
  const matchMark: SamakanMark = r.samePick ? 'same' : 'different'

  return (
    <div className="px-6 pt-5" aria-live="polite">
      {live && (
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-purple-700 animate-fade-in">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> You both locked in
        </p>
      )}
      <div className="space-y-2">
        <SourceChip source={round.source} />
        <h2 className="break-words text-xl font-bold leading-snug text-ink">{round.prompt}</h2>
      </div>

      <div className="mt-5">
        <RevealRows round={round} mine={mine} partner={partner} partnerName={partnerName} animate />
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-2 animate-fade-in motion-reduce:animate-none"
        style={{ animationDelay: '900ms', animationFillMode: 'backwards' }}
      >
        {round.kind === 'match'
          ? <MarkChip mark={matchMark} className="px-3 py-1 text-xs">{roundSummary(round, mine, partner)}</MarkChip>
          : <p className="text-sm font-semibold text-ink">{roundSummary(round, mine, partner)}</p>}
      </div>

      {round.talk && (
        <div
          className="mt-4 rounded-2xl border border-purple-100 bg-purple-50/70 p-4 animate-fade-in motion-reduce:animate-none"
          style={{ animationDelay: '1100ms', animationFillMode: 'backwards' }}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-700">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Talk about it
          </p>
          <p className="mt-1.5 break-words text-sm leading-relaxed text-ink">{round.talk}</p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        {onSkipToResults && (
          <button type="button" onClick={onSkipToResults} className="shrink-0 px-1 py-2 text-sm font-semibold text-ink-muted hover:text-ink">
            Skip to results
          </button>
        )}
        <Button className="ml-auto w-auto px-8" onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  )
}
