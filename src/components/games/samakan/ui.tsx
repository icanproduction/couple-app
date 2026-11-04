'use client'

// Small pieces the Samakan screens share: names, dates, chips, banners and
// the top bar of the set screen.

import Link from 'next/link'
import { CloudOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GAME_PATH } from './logic'
import type { SamakanMark, SamakanRound, SamakanRoundSource, SamakanSet } from '@/types/samakan'

// ---------- names, dates ----------

/** The partner's name, or "your partner". */
export function partnerLabel(name: string | null | undefined): string {
  const n = name?.trim()
  return n ? n : 'your partner'
}

/** "Kezia" from "Kezia Anastasya", for chips and row labels. */
export function firstName(name: string): string {
  if (name.trim().toLowerCase() === 'your partner') return name
  return name.trim().split(/\s+/)[0] || name
}

/** First letter up, for the start of a sentence. */
export function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** "3 Nov" in Jakarta time. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })
}

/** "15:30" in Jakarta time, or "Mon 15:30" when it isn't today. */
export function clockTime(at: Date, now: Date): string {
  const time = at.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const day = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' })
  if (day(at) === day(now)) return time
  return `${at.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', weekday: 'short' })} ${time}`
}

// ---------- set helpers ----------

/** What happened to a nudge, in words. */
export function nudgeText(reply: { sent: boolean; reason: string | null }, partner: string): string {
  const them = cap(partner)
  if (reply.sent) return `Nudge sent. ${them} gets one notification.`
  if (reply.reason === 'muted') return `${them} has game notifications off or is in quiet hours. Try again later.`
  return `${them} can't get notifications on this phone right now.`
}

/** Partner started, or is ahead of me: the hub says "Your turn". */
export function isMyTurn(set: SamakanSet, me: string): boolean {
  if (set.status !== 'open' || set.progress.me >= set.total) return false
  return set.createdBy !== me || set.progress.partner > set.progress.me
}

const FALLBACK_TEXT: Partial<Record<NonNullable<SamakanSet['fallbackReason']>, string>> = {
  timeout: 'Couldn\'t write personal rounds this time, so here\'s a mixed set.',
  error: 'Couldn\'t write personal rounds this time, so here\'s a mixed set.',
  refusal: 'Couldn\'t write personal rounds this time, so here\'s a mixed set.',
  max_tokens: 'Couldn\'t write personal rounds this time, so here\'s a mixed set.',
  invalid: 'Couldn\'t write personal rounds this time, so here\'s a mixed set.',
  cap: 'Couldn\'t write personal rounds this time, so here\'s a mixed set.',
  no_data: 'Answer a few Daily Questions first and these get personal. Here\'s a mixed set for now.',
  daily_limit: 'Today\'s personal set is done, so here\'s a mixed set. Back tomorrow.',
  personal_off: 'Personal rounds are off for you two, so here\'s a mixed set.',
}

/** Why a "For you two" tap became a bank set, in words. */
export function fallbackText(set: SamakanSet): string | null {
  if (set.source !== 'bank' || !set.fallbackReason) return null
  return FALLBACK_TEXT[set.fallbackReason] ?? null
}

const SOURCE_TEXT: Record<SamakanRoundSource, string | null> = {
  daily: 'From your Daily Questions',
  moments: 'From your Moments',
  mood: 'From your moods',
  bucket: 'From your Bucket List',
  general: null,
}

/** The text of one pick: the option, or the number on a scale. */
export function valueText(round: Pick<SamakanRound, 'kind' | 'options' | 'low' | 'high'>, n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  if (round.kind === 'scale') {
    if (n === 1 && round.low) return `1 (${round.low})`
    if (n === 5 && round.high) return `5 (${round.high})`
    return String(n)
  }
  return round.options[n] ?? ''
}

// ---------- chips ----------

export function SourceChip({ source }: { source: SamakanRoundSource }) {
  const text = SOURCE_TEXT[source]
  if (!text) return null
  return (
    <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
      {text}
    </span>
  )
}

const MARK_TONE: Record<SamakanMark, string> = {
  same: 'bg-sage/20 text-sage-dark',
  right: 'bg-sage/20 text-sage-dark',
  close: 'bg-sky-50 text-sky-700',
  new: 'bg-gold/25 text-yellow-800',
  different: 'bg-gold/25 text-yellow-800',
}

/** A reveal mark. Differences are news (gold), never red. */
export function MarkChip({ mark, children, className }: { mark: SamakanMark; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold', MARK_TONE[mark], className)}>
      {children}
    </span>
  )
}

// ---------- banners ----------

export function OfflineBanner() {
  return (
    <div role="status" className="flex items-start gap-2.5 border-b border-gold/30 bg-gold/15 px-6 py-2.5">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-yellow-800" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-ink-light">
        You&apos;re offline. Your picks are saved here and send when you&apos;re back.
      </p>
    </div>
  )
}

/** "Kezia is here" / "Kezia stepped away": inline, never an overlay. */
export function LiveLine({ here, left, partner }: { here: boolean; left: boolean; partner: string }) {
  if (!here && !left) return null
  return (
    <p role="status" className={cn('flex items-start gap-2 text-xs leading-relaxed', here ? 'text-sage-dark' : 'text-ink-muted')}>
      <span
        className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', here ? 'bg-sage motion-safe:animate-pulse' : 'bg-border')}
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">
        {here
          ? `${cap(partner)} is here. Answers show up as soon as you both lock in.`
          : `${cap(partner)} stepped away. Your answers are saved.`}
      </span>
    </p>
  )
}

export function Notice({ children, tone = 'neutral', onClose }: { children: React.ReactNode; tone?: 'neutral' | 'warn'; onClose?: () => void }) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 animate-fade-in',
        tone === 'warn' ? 'border-rose/20 bg-rose/5' : 'border-purple-100 bg-purple-50/70',
      )}
    >
      <p className={cn('min-w-0 flex-1 break-words text-xs leading-relaxed', tone === 'warn' ? 'font-medium text-rose-dark' : 'text-ink-light')}>
        {children}
      </p>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-semibold text-ink-muted hover:text-ink">
          Close
        </button>
      )}
    </div>
  )
}

// ---------- set top bar ----------

type DotState = 'done' | 'skipped' | 'current' | 'todo'

/** "x  Weekends   Round 2 / 7", the seven dots and "Kezia here". */
export function SetTopBar({
  title,
  rounds,
  currentId,
  partnerHere,
  partner,
}: {
  title: string
  rounds: Pick<SamakanRound, 'id' | 'position' | 'skipped' | 'mine' | 'revealed'>[]
  currentId: string | null
  partnerHere: boolean
  partner: string
}) {
  const current = rounds.find((r) => r.id === currentId) ?? null
  const dots: DotState[] = rounds.map((r) =>
    r.id === currentId ? 'current' : r.skipped ? 'skipped' : r.mine || r.revealed ? 'done' : 'todo')
  return (
    <div className="border-b border-border bg-white px-4 pb-3 pt-4">
      <div className="flex items-center gap-2">
        <Link
          href={GAME_PATH}
          aria-label="Back to Samakan"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-cream hover:text-ink"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{title}</p>
        {current && (
          <p className="shrink-0 text-xs font-semibold tabular-nums text-ink-muted">
            Round {current.position + 1} / {rounds.length}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 pl-10">
        <ol className="flex items-center gap-1.5" aria-label="Rounds">
          {dots.map((d, i) => (
            <li
              key={i}
              aria-label={`Round ${i + 1}: ${d === 'current' ? 'this one' : d === 'done' ? 'answered' : d === 'skipped' ? 'skipped' : 'not answered yet'}`}
              className={cn('h-2.5 w-2.5 rounded-full', {
                'bg-purple-500': d === 'done',
                'border border-dashed border-ink-muted/50': d === 'skipped',
                'bg-white ring-2 ring-purple-500 ring-offset-1': d === 'current',
                'bg-border': d === 'todo',
              })}
            />
          ))}
        </ol>
        {partnerHere && (
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-sage-dark">
            <span className="h-2 w-2 shrink-0 rounded-full bg-sage" aria-hidden="true" />
            <span className="truncate">{cap(partner)} here</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return <p id={id} className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">{children}</p>
}
