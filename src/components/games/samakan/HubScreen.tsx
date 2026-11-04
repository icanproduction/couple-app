'use client'

// The Samakan hub: the open set (whoever started it), ways to start one,
// best / weeks in a row / sets played, past sets, older games and how it
// works. Live: any change to the couple's sets or invites refetches the hub.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BellRing, ChevronDown, ChevronRight, History, Lock, Radio, Sparkles, UserPlus,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import GameHeader from '@/components/games/two-truths/GameHeader'
import { GameSkeleton, LoadErrorCard, StateCard } from '@/components/games/two-truths/StateCard'
import {
  acceptLive, loadContext, loadHub, loadMessage, messageFor, nudgePartner, playLive, useNow, useOnline, useSamakanRealtime,
  type SamakanContext,
} from '@/lib/samakan'
import {
  BANK_THEMES, GAME_PATH, THEME_LABELS, inviteIsLive, nudgeOpensAt, setPath, streakLine,
} from './logic'
import StartSheet, { type StartTheme } from './StartSheet'
import EndSetModal from './EndSetModal'
import { Notice, OfflineBanner, SectionLabel, cap, clockTime, isMyTurn, nudgeText, partnerLabel, shortDate } from './ui'
import type { SamakanHub, SamakanSet } from '@/types/samakan'

type HubLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-partner' }
  | { status: 'ready'; ctx: SamakanContext; hub: SamakanHub }

function useHub() {
  const router = useRouter()
  const [load, setLoad] = useState<HubLoad>({ status: 'loading' })
  const seq = useRef(0)
  const hasData = useRef(false)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const [ctx, hub] = await Promise.all([loadContext(), loadHub()])
      if (mine !== seq.current) return
      if (!ctx) { router.replace('/auth/login'); return }
      hasData.current = true
      if (!hub.coupleId || (!hub.hasPartner && !hub.closed)) { setLoad({ status: 'no-partner' }); return }
      setLoad({ status: 'ready', ctx, hub })
    } catch (e) {
      if (mine !== seq.current) return
      console.error('[samakan] hub load failed', e)
      if (hasData.current) return
      setLoad({ status: 'error', message: loadMessage(e) })
    }
  }, [router])

  useEffect(() => { void reload() }, [reload])
  const coupleId = load.status === 'ready' ? load.hub.coupleId : null
  useSamakanRealtime(coupleId ? { coupleId } : null, () => { void reload() })

  const retry = useCallback(() => {
    hasData.current = false
    setLoad({ status: 'loading' })
    void reload()
  }, [reload])

  return { load, reload, retry }
}

export default function HubScreen() {
  const { load, reload, retry } = useHub()

  if (load.status === 'loading') return <GameSkeleton cards={3} />
  const header = (partner?: string) => (
    <GameHeader
      title="Samakan"
      subtitle={partner ? `Seven quick rounds. You answer now, ${partner} answers whenever.` : 'Guess each other\'s answers'}
      backHref="/app/games"
      backLabel="Games"
    />
  )
  if (load.status === 'error') {
    return <div className="pb-6">{header()}<LoadErrorCard message={load.message} onRetry={retry} /></div>
  }
  if (load.status === 'no-partner') {
    return (
      <div className="pb-6">
        {header()}
        <StateCard icon={UserPlus} title="Samakan needs two" body="Invite your partner first. Once they join, you can start a set together.">
          <Link href="/onboarding/invite" className={buttonVariants()}>Invite your partner</Link>
        </StateCard>
      </div>
    )
  }
  const partner = partnerLabel(load.ctx.partner?.name)
  return (
    <div className="animate-fade-in pb-6">
      {header(load.hub.closed ? undefined : partner)}
      <Hub ctx={load.ctx} hub={load.hub} reload={reload} />
    </div>
  )
}

function OpenSetCard({
  set, me, partner, now, onEnd, onPlayNow, liveBusy, onNudge, nudging,
}: {
  set: SamakanSet
  me: string
  partner: string
  now: Date | null
  onEnd: () => void
  onPlayNow: () => void
  liveBusy: boolean
  onNudge: () => void
  nudging: boolean
}) {
  const them = cap(partner)
  const theme = THEME_LABELS[set.theme]
  const { me: mine, partner: theirs } = set.progress
  const myDone = mine >= set.total
  const theirDone = theirs >= set.total
  const myTurn = isMyTurn(set, me)
  const nudgeAt = nudgeOpensAt(set)
  const nudgeOpen = !!nudgeAt && !!now && now.getTime() >= nudgeAt.getTime()
  const outgoing = !!set.liveInvite && set.liveInvite.createdBy === me && !!now && inviteIsLive(set.liveInvite, now)

  let eyebrow: string
  let title: string
  let cta: string
  if (!myDone && myTurn && mine === 0) {
    eyebrow = 'Your turn'
    title = `${them} started "${theme}"`
    cta = 'Answer now'
  } else if (!myDone) {
    eyebrow = myTurn ? 'Your turn' : 'In progress'
    title = `"${theme}", round ${mine + 1} of ${set.total}`
    cta = 'Keep going'
  } else {
    eyebrow = theirDone ? 'Ready' : `Waiting for ${them}`
    title = `You're done with "${theme}"`
    cta = set.revealed > 0 ? `See ${set.revealed} ${set.revealed === 1 ? 'reveal' : 'reveals'}` : 'Open set'
  }
  const partnerLine = theirs === 0
    ? (myDone || set.createdBy === me ? `${them} hasn't started yet` : `${them} 0 of ${set.total}`)
    : theirDone ? `${them} is done` : `${them} is on round ${theirs + 1}`

  return (
    <div className={cn(
      'overflow-hidden rounded-2xl shadow-elevated',
      myTurn ? 'bg-gradient-to-br from-purple-500 to-indigo-500 text-white' : 'border border-border bg-white text-ink',
    )}>
      <Link href={setPath(set.id)} className="block p-5 transition-transform active:scale-[0.99]">
        <p className={cn('text-[11px] font-bold uppercase tracking-wider', myTurn ? 'text-white/80' : 'text-purple-600')}>{eyebrow}</p>
        <p className="mt-1 break-words text-lg font-bold leading-snug">{title}</p>
        <p className={cn('mt-1 text-sm', myTurn ? 'text-white/85' : 'text-ink-muted')}>
          <span className="tabular-nums">You {mine} of {set.total}</span>
          <span aria-hidden="true"> · </span>
          <span className="break-words">{partnerLine}</span>
        </p>
        <span className={cn(
          'mt-4 inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-bold',
          myTurn ? 'bg-white text-purple-700' : 'bg-purple-50 text-purple-700',
        )}>
          {cta} <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
      <div className={cn('space-y-2 px-5 pb-4', myTurn ? 'text-white' : '')}>
        {myDone && !theirDone && !set.nudged && nudgeAt && (
          nudgeOpen ? (
            <button
              type="button"
              onClick={onNudge}
              disabled={nudging}
              className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 disabled:opacity-60"
            >
              <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> {nudging ? 'Sending...' : `Nudge ${them}`}
            </button>
          ) : now ? (
            <p className="text-xs text-ink-muted">You can nudge {them} from {clockTime(nudgeAt, now)}.</p>
          ) : null
        )}
        {myDone && !theirDone && set.nudged && <p className="text-xs text-ink-muted">Nudge sent.</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
          {outgoing ? (
            <span className={cn('flex items-center gap-1.5 text-xs', myTurn ? 'text-white/85' : 'text-ink-muted')}>
              <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Asked {them} to join now
            </span>
          ) : (
            <button
              type="button"
              onClick={onPlayNow}
              disabled={liveBusy}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold disabled:opacity-60',
                myTurn ? 'text-white hover:text-white/80' : 'text-purple-700 hover:text-purple-900',
              )}
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" /> {liveBusy ? 'Sending...' : 'Play now together'}
            </button>
          )}
          <button
            type="button"
            onClick={onEnd}
            className={cn('text-xs font-semibold', myTurn ? 'text-white/75 hover:text-white' : 'text-ink-muted hover:text-ink')}
          >
            End set
          </button>
        </div>
      </div>
    </div>
  )
}

function Hub({ ctx, hub, reload }: { ctx: SamakanContext; hub: SamakanHub; reload: () => Promise<void> }) {
  const router = useRouter()
  const online = useOnline()
  const now = useNow()
  const partner = partnerLabel(ctx.partner?.name)
  const them = cap(partner)
  const me = ctx.userId
  const open = hub.openSet
  const closed = hub.closed

  const [startTheme, setStartTheme] = useState<StartTheme | null>(null)
  const [ending, setEnding] = useState(false)
  const [liveBusy, setLiveBusy] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [notice, setNotice] = useState<{ text: string; tone: 'neutral' | 'warn' } | null>(null)
  const startRef = useRef<HTMLDivElement>(null)

  // "Another set" from results lands on #start.
  useEffect(() => {
    if (window.location.hash === '#start') startRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  const invite = open?.liveInvite ?? null
  const incoming = !!invite && invite.createdBy !== me && !!now && inviteIsLive(invite, now)

  async function playNow() {
    if (!open || liveBusy) return
    setLiveBusy(true)
    setNotice(null)
    try {
      await playLive(open.id)
      router.push(setPath(open.id))
    } catch (e) {
      setNotice({ text: messageFor(e), tone: 'warn' })
      setLiveBusy(false)
    }
  }

  async function join() {
    if (!open || !invite) return
    try {
      await acceptLive(invite.id)
    } catch {
      // Opening the set is what matters; the invite may just have run out.
    }
    router.push(setPath(open.id))
  }

  async function nudge() {
    if (!open || nudging) return
    setNudging(true)
    setNotice(null)
    try {
      setNotice({ text: nudgeText(await nudgePartner(open.id), partner), tone: 'neutral' })
      void reload()
    } catch (e) {
      setNotice({ text: messageFor(e), tone: 'warn' })
    } finally {
      setNudging(false)
    }
  }

  const { stats } = hub
  const streak = streakLine(stats.streakWeeks)
  const firstTime = !open && stats.setsPlayed === 0 && hub.sets.length === 0
  const canStart = !open && !closed && online
  const personalOff = !hub.personal.enabled
  const personalUsed = hub.personal.usedToday

  return (
    <>
      {!online && <OfflineBanner />}
      <div className="space-y-3 px-6 pt-5">
        {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

        {closed && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-cream p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-light">
              Your partner left this couple space. Past sets stay here to look back on, but new sets are off.
            </p>
          </div>
        )}

        {incoming && open && !closed && (
          <div className="flex items-center gap-3 rounded-2xl border border-sage/40 bg-sage/10 p-4 animate-fade-in">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sage motion-safe:animate-pulse" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{them} is on Samakan now</p>
            <Button size="sm" className="w-auto px-4" onClick={() => void join()}>Join</Button>
          </div>
        )}

        {open && !closed && (
          <OpenSetCard
            set={open}
            me={me}
            partner={partner}
            now={now}
            onEnd={() => setEnding(true)}
            onPlayNow={() => void playNow()}
            liveBusy={liveBusy}
            onNudge={() => void nudge()}
            nudging={nudging}
          />
        )}
      </div>

      {!closed && (
        <div ref={startRef} id="start" className="scroll-mt-4 px-6 pt-7">
          <SectionLabel>Start a set</SectionLabel>
          {open && <p className="mb-3 text-xs text-ink-muted">Finish or end this set first.</p>}

          <div className={cn('rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50 to-white p-4 shadow-card', !canStart && 'opacity-60')}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-purple-600 shadow-card" aria-hidden="true">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">For you two</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  {personalOff
                    ? 'Personal rounds are off for you two.'
                    : personalUsed
                      ? 'Today\'s personal set is done. Back tomorrow.'
                      : 'From your Daily Questions and Moments. One a day.'}
                </p>
                {personalOff && (
                  <Link href="/app/profile" className="mt-1 inline-block text-xs font-semibold text-purple-700 underline-offset-2 hover:underline">
                    Turn them on in Profile
                  </Link>
                )}
              </div>
              <Button
                size="sm"
                className="w-auto shrink-0 px-4"
                disabled={!canStart || personalOff || personalUsed}
                onClick={() => setStartTheme('personal')}
              >
                Start
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2.5" role="group" aria-label="Themes">
            {BANK_THEMES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={!canStart}
                onClick={() => setStartTheme(t)}
                className="min-w-0 rounded-xl border border-border bg-white px-2 py-3.5 text-center text-sm font-semibold text-ink shadow-card transition-all hover:border-purple-200 active:scale-[0.98] disabled:opacity-50"
              >
                <span className="block truncate">{THEME_LABELS[t]}</span>
              </button>
            ))}
          </div>
          {!online && <p className="mt-2 text-xs text-ink-muted">You can start a set once you&apos;re back online.</p>}
        </div>
      )}

      {stats.setsPlayed > 0 && (
        <div className="px-6 pt-7">
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Best" value={stats.best ? `${stats.best.matches} of ${stats.best.maxMatches}` : '-'} />
            <Stat label="In a row" value={streak ? `${stats.streakWeeks} ${stats.streakWeeks === 1 ? 'week' : 'weeks'}` : '0 weeks'} />
            <Stat label="Sets played" value={String(stats.setsPlayed)} />
          </div>
          {stats.last && (
            <p className="mt-2 text-xs text-ink-muted">Last time: {stats.last.matches} of {stats.last.maxMatches}</p>
          )}
        </div>
      )}

      {(hub.sets.length > 0 || hub.legacyCount > 0) && (
        <div className="px-6 pt-7">
          <SectionLabel>Past sets</SectionLabel>
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            {hub.sets.map((s, i) => (
              <Link
                key={s.id}
                href={setPath(s.id)}
                className={cn('flex items-center gap-3 px-4 py-3 hover:bg-cream', i > 0 && 'border-t border-border')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{THEME_LABELS[s.theme]}</span>
                  <span className="block text-xs text-ink-muted">{shortDate(s.finishedAt ?? s.endedAt ?? s.createdAt)}</span>
                </span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                  {s.status === 'done'
                    ? `${s.matches} of ${s.maxMatches}`
                    : <span className="text-xs font-medium text-ink-muted">{s.status === 'expired' ? 'Ran out' : 'Ended'}, {s.revealed} {s.revealed === 1 ? 'round' : 'rounds'}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </Link>
            ))}
            {hub.legacyCount > 0 && (
              <Link
                href={`${GAME_PATH}/older`}
                className={cn('flex items-center gap-3 px-4 py-3 hover:bg-cream', hub.sets.length > 0 && 'border-t border-border')}
              >
                <History className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">Older games ({hub.legacyCount})</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}

      <details open={firstTime} className="group mx-6 mt-7 rounded-2xl border border-purple-100 bg-purple-50/60 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-purple-700 [&::-webkit-details-marker]:hidden">
          How it works
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-ink-light">
          Pick your answer, then guess {possessiveName(partner)}. Each round opens once you&apos;ve both answered.
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-snug text-ink-light">
          <li><span className="font-semibold text-ink">Same page:</span> two options. You match when you pick the same one.</li>
          <li><span className="font-semibold text-ink">Guess me:</span> pick yours, then guess {possessiveName(partner)}. A point for each right guess.</li>
          <li><span className="font-semibold text-ink">On a scale:</span> rate yourself from 1 to 5, then guess {them}. Exact guesses score.</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          No timers. A set stays open for 7 days. Open the same set at the same time and the reveals land on both phones together.
        </p>
      </details>

      <StartSheet
        theme={startTheme}
        partner={partner}
        onClose={() => setStartTheme(null)}
        onStarted={(res) => router.push(setPath(res.id))}
      />
      <EndSetModal
        setId={ending && open ? open.id : null}
        onClose={() => setEnding(false)}
        onEnded={() => { setEnding(false); void reload() }}
      />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-white px-3 py-3 shadow-card">
      <p className="truncate text-base font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-muted">{label}</p>
    </div>
  )
}

/** "Kezia's", or "your partner's". */
function possessiveName(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
}
