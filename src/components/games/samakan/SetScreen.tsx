'use client'

// The set screen: answer a round, wait, reveal, results. One view at a time:
//   round   -> pick (and guess), Lock in
//   locked  -> partner hasn't answered this round: Change answer / Next round
//   reveal  -> both answered: stays until Next (live when it opened on screen)
//   waiting -> I answered everything, the partner hasn't
//   results -> the set is done, ended or expired
// The view is derived from server state and pinned, so a realtime refetch
// never pulls someone out of a round they're answering. Idle views (locked,
// waiting) give way to a reveal the moment it opens.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SearchX, UserPlus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import GameHeader from '@/components/games/two-truths/GameHeader'
import { GameSkeleton, LoadErrorCard, StateCard } from '@/components/games/two-truths/StateCard'
import {
  acceptLive, answerRound, codeFor, messageFor, nudgePartner, playLive, readDrafts, readSeen, requestReadout,
  saveDraft, skipRound, useNow, useOnline, usePartnerPresence, writeSeen, type DraftPick, type SamakanContext,
} from '@/lib/samakan'
import {
  GAME_PATH, SKIP_LIMIT, THEME_LABELS, canChange, canLockIn, canSkip, inviteIsLive, nextRoundIndex, nudgeOpensAt,
} from './logic'
import RoundPlay, { type Picks } from './RoundPlay'
import RoundReveal from './RoundReveal'
import SetResults from './SetResults'
import { LockedCard, PlayNowButton, WaitingCard } from './SetWaiting'
import EndSetModal from './EndSetModal'
import { LiveLine, Notice, OfflineBanner, SetTopBar, cap, fallbackText, nudgeText, partnerLabel, shortDate } from './ui'
import { UUID_RE, useSamakanSet, withAnswer, withSkip } from './useSamakanSet'
import type { SamakanRound, SamakanSetState } from '@/types/samakan'

type View =
  | { kind: 'round'; roundId: string; editing: boolean }
  | { kind: 'locked'; roundId: string }
  | { kind: 'reveal'; roundId: string; live: boolean; mode: 'next' | 'replay' | 'walk' }
  | { kind: 'waiting' }
  | { kind: 'results' }

const WALK_DAYS = 7
const EMPTY: Picks = { pick: null, guess: null }

/** Both answered and not skipped: the reveal is open. */
function isOpenReveal(r: SamakanRound | undefined): boolean {
  return !!r && !r.skipped && r.revealed && !!r.mine && !!r.partner
}

export default function SetScreen({ setId }: { setId: string }) {
  const { load, reload, patch, retry } = useSamakanSet(setId)

  if (load.status === 'loading') return <GameSkeleton cards={3} />
  if (load.status === 'error') {
    return (
      <div className="pb-6">
        <GameHeader title="Samakan" backHref={GAME_PATH} backLabel="Samakan" />
        <LoadErrorCard message={load.message} onRetry={retry} />
      </div>
    )
  }
  if (load.status === 'missing') {
    return (
      <div className="pb-6">
        <GameHeader title="Samakan" backHref={GAME_PATH} backLabel="Samakan" />
        <StateCard icon={SearchX} title="This set isn't here anymore" body="It may have been removed along with an account.">
          <Link href={GAME_PATH} className={buttonVariants()}>Back to Samakan</Link>
        </StateCard>
      </div>
    )
  }
  if (load.status === 'no-partner') {
    return (
      <div className="pb-6">
        <GameHeader title="Samakan" backHref={GAME_PATH} backLabel="Samakan" />
        <StateCard icon={UserPlus} title="Samakan needs two" body="Invite your partner first.">
          <Link href="/onboarding/invite" className={buttonVariants()}>Invite your partner</Link>
        </StateCard>
      </div>
    )
  }
  return <SetPlay key={setId} ctx={load.ctx} data={load.data} reload={reload} patch={patch} />
}

interface SetPlayProps {
  ctx: SamakanContext
  data: SamakanSetState
  reload: () => Promise<void>
  patch: (fn: (d: SamakanSetState) => SamakanSetState) => void
}

function SetPlay({ ctx, data, reload, patch }: SetPlayProps) {
  const router = useRouter()
  const { set, rounds } = data
  const me = ctx.userId
  const partner = partnerLabel(ctx.partner?.name)
  const them = cap(partner)
  const open = set.status === 'open' && !ctx.closed
  const online = useOnline()
  const now = useNow()
  const presence = usePartnerPresence(set.id, me, open)

  // This phone only (client-only component, so storage reads can't break hydration).
  const [seen, setSeen] = useState<Set<string>>(() => new Set(readSeen(set.id)))
  const [drafts, setDrafts] = useState<Record<string, DraftPick>>(() => readDrafts(set.id))
  const [view, setView] = useState<View | null>(null)
  const [busy, setBusy] = useState<'lock' | 'skip' | null>(null)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [fallbackHidden, setFallbackHidden] = useState(false)
  const [liveBusy, setLiveBusy] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [ending, setEnding] = useState(false)

  const byId = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds])
  const revealed = useMemo(() => rounds.filter((r) => !r.skipped && r.revealed && !!r.mine && !!r.partner), [rounds])
  const nextIdx = nextRoundIndex(rounds)

  const autoView = useCallback((seenIds: Set<string>): View => {
    const unseen = revealed.filter((r) => !seenIds.has(r.id))
    if (!open) {
      const finished = set.finishedAt ? Date.parse(set.finishedAt) : NaN
      const recent = set.status === 'done' && Number.isFinite(finished) && Date.now() - finished < WALK_DAYS * 86_400_000
      if (recent && unseen.length) return { kind: 'reveal', roundId: unseen[0].id, live: false, mode: 'walk' }
      return { kind: 'results' }
    }
    if (unseen.length) return { kind: 'reveal', roundId: unseen[0].id, live: false, mode: 'next' }
    if (nextIdx >= 0) return { kind: 'round', roundId: rounds[nextIdx].id, editing: false }
    return { kind: 'waiting' }
  }, [revealed, open, set.finishedAt, set.status, nextIdx, rounds])

  const resolve = useCallback((v: View | null): View => {
    if (!v) return autoView(seen)
    const r = 'roundId' in v ? byId.get(v.roundId) : undefined
    switch (v.kind) {
      case 'round':
        if (!r || r.skipped || !open) return autoView(seen)
        if (isOpenReveal(r)) return { kind: 'reveal', roundId: v.roundId, live: true, mode: 'next' }
        if (r.mine && !v.editing) return { kind: 'locked', roundId: v.roundId }
        if (!r.mine && v.editing) return { kind: 'round', roundId: v.roundId, editing: false }
        return v
      case 'locked':
        if (isOpenReveal(r)) return { kind: 'reveal', roundId: v.roundId, live: true, mode: 'next' }
        if (!r || !open || !r.mine || r.skipped) return autoView(seen)
        return v
      case 'reveal':
        return isOpenReveal(r) ? v : autoView(seen)
      case 'waiting': {
        if (!open || nextIdx >= 0) return autoView(seen)
        const unseen = revealed.find((x) => !seen.has(x.id))
        if (unseen) return { kind: 'reveal', roundId: unseen.id, live: true, mode: 'next' }
        return v
      }
      case 'results':
        return open ? autoView(seen) : v
    }
  }, [autoView, byId, open, nextIdx, revealed, seen])

  const current = resolve(view)
  const currentKey = JSON.stringify(current)

  // Pin the derived view (so later refetches can't move a round that's being
  // answered), and say why it moved when the partner caused it.
  useEffect(() => {
    if (JSON.stringify(view) === currentKey) return
    if (view?.kind === 'round') {
      const r = byId.get(view.roundId)
      if (view.editing && current.kind === 'reveal' && current.roundId === view.roundId) {
        setNotice(`${them} answered this one first, so your locked answer counts.`)
      } else if (r?.skipped && r.skippedBy !== me) {
        setNotice(`Skipped by ${them}`)
      }
    }
    setView(current)
    // currentKey stands for current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, view])

  // An invite from the partner, and I'm on the set: that's a yes.
  const invite = set.liveInvite
  const incoming = !!invite && invite.createdBy !== me && !!now && inviteIsLive(invite, now)
  const outgoing = !!invite && invite.createdBy === me && !!now && inviteIsLive(invite, now)
  const accepted = useRef(new Set<string>())
  useEffect(() => {
    if (!incoming || !invite || accepted.current.has(invite.id)) return
    accepted.current.add(invite.id)
    acceptLive(invite.id).catch(() => {})
  }, [incoming, invite])
  // The "live" push opens set/<id>?live=<inviteId>: accept that one too, even
  // if a newer row hasn't reached this phone yet.
  useEffect(() => {
    if (!open) return
    let fromPush: string | null = null
    try {
      fromPush = new URLSearchParams(window.location.search).get('live')
    } catch {
      fromPush = null
    }
    if (!fromPush || !UUID_RE.test(fromPush) || accepted.current.has(fromPush)) return
    accepted.current.add(fromPush)
    acceptLive(fromPush).catch(() => {})
  }, [open])

  // ---------- picks ----------

  const markSeen = useCallback((ids: string[]) => {
    setSeen((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      writeSeen(set.id, Array.from(next))
      return next
    })
  }, [set.id])

  const setDraft = useCallback((roundId: string, draft: DraftPick | null) => {
    setDrafts((prev) => {
      const next = { ...prev }
      if (draft) next[roundId] = draft
      else delete next[roundId]
      return next
    })
    saveDraft(set.id, roundId, draft)
  }, [set.id])

  const picksFor = (r: SamakanRound, editing: boolean): Picks => {
    const d = drafts[r.id]
    if (d) return { pick: d.pick, guess: d.guess }
    if (editing && r.mine) return { pick: r.mine.pick, guess: r.mine.guess }
    return EMPTY
  }

  const lockIn = useCallback(async (roundId: string, picks: Picks, opts: { quiet?: boolean } = {}) => {
    if (busyRef.current) return
    const r = byId.get(roundId)
    if (!r) return
    const guess = r.kind === 'match' ? null : picks.guess
    if (picks.pick === null || !canLockIn(r.kind, picks.pick, guess)) return
    busyRef.current = true
    setBusy('lock')
    setError(null)
    try {
      const res = await answerRound(roundId, picks.pick, guess)
      setDraft(roundId, null)
      patch((d) => withAnswer(d, roundId, res, me))
      if (!opts.quiet) setView(res.revealed ? { kind: 'reveal', roundId, live: true, mode: 'next' } : { kind: 'locked', roundId })
      if (res.done) void requestReadout(set.id)
      void reload()
    } catch (e) {
      const code = codeFor(e)
      if (code === 'NETWORK') {
        setDraft(roundId, { pick: picks.pick, guess, queued: true })
        setError(messageFor(e))
      } else if (code === 'SK_LOCKED') {
        setDraft(roundId, null)
        setNotice(`${them} answered this one first, so your locked answer counts.`)
        void reload()
      } else if (code === 'SK_ENDED' || code === 'SK_SKIPPED' || code === 'SK_NOT_FOUND') {
        setDraft(roundId, null)
        setNotice(messageFor(e))
        void reload()
      } else {
        // Keep the picks on screen, but don't resend them on their own.
        setDraft(roundId, { pick: picks.pick, guess, queued: false })
        setError(messageFor(e))
      }
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [byId, me, patch, reload, set.id, setDraft, them])

  const skip = useCallback(async (roundId: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy('skip')
    setError(null)
    try {
      const res = await skipRound(roundId)
      setDraft(roundId, null)
      patch((d) => withSkip(d, roundId, me, res.done, res.version))
      setView(null)
      void reload()
    } catch (e) {
      const code = codeFor(e)
      if (code === 'SK_ANSWERED' || code === 'SK_SKIPPED' || code === 'SK_ENDED') void reload()
      setError(messageFor(e))
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [me, patch, reload, setDraft])

  // Picks completed offline go out once the phone is back online: one try
  // per round each time the connection comes back, never a retry loop.
  const autoSent = useRef(new Set<string>())
  useEffect(() => {
    if (!online) autoSent.current.clear()
  }, [online])
  useEffect(() => {
    if (!online || !open || busy || navigator.onLine === false) return
    const entry = Object.entries(drafts).find(([id, d]) => {
      const r = byId.get(id)
      return d.queued && !autoSent.current.has(id) && !!r && !r.skipped && !r.mine
        && canLockIn(r.kind, d.pick, r.kind === 'match' ? null : d.guess)
    })
    if (!entry) return
    const [roundId, d] = entry
    autoSent.current.add(roundId)
    const onScreen = (current.kind === 'round' || current.kind === 'locked') && current.roundId === roundId
    void lockIn(roundId, { pick: d.pick, guess: d.guess }, { quiet: !onScreen })
  }, [online, open, busy, drafts, byId, current, lockIn])

  // ---------- live, nudge ----------

  async function playNow() {
    if (liveBusy) return
    setLiveBusy(true)
    setError(null)
    try {
      const res = await playLive(set.id)
      setNotice(res.joined
        ? `${them} asked first, so you're in. Answers show up as soon as you both lock in.`
        : res.created
          ? `Sent. ${them} gets a notification to open this set now.`
          : `Already asked. ${them} can open it from the notification.`)
      void reload()
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setLiveBusy(false)
    }
  }

  async function nudge() {
    if (nudging) return
    setNudging(true)
    setError(null)
    try {
      setNotice(nudgeText(await nudgePartner(set.id), partner))
      void reload()
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setNudging(false)
    }
  }

  // ---------- labels ----------

  const nextLabelFor = (v: View): string => {
    if (v.kind === 'round') return 'Next round'
    if (v.kind === 'reveal') return 'Next reveal'
    if (v.kind === 'waiting') return 'Done for now'
    return 'See results'
  }

  const title = THEME_LABELS[set.theme]
  const skipsLeft = Math.max(0, SKIP_LIMIT - set.skips)
  const showPlayNow = open && !presence.here && !!ctx.partner
  const fallback = fallbackText(set)
  const showFallback = !!fallback && !fallbackHidden && set.createdBy === me && set.progress.me === 0 && open

  const banners = (
    <div className="space-y-3 px-6 pt-4 empty:hidden">
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      {showFallback && <Notice onClose={() => setFallbackHidden(true)}>{fallback}</Notice>}
      {/* The locked and waiting cards say "here" in their own words; a reveal needs no reminder. */}
      {open && (
        <LiveLine
          here={presence.here && current.kind === 'round'}
          left={presence.left && current.kind !== 'reveal'}
          partner={partner}
        />
      )}
    </div>
  )

  // ---------- results ----------

  if (current.kind === 'results') {
    return (
      <div className="animate-fade-in pb-6">
        <GameHeader title={title} subtitle={shortDate(set.finishedAt ?? set.endedAt ?? set.createdAt)} backHref={GAME_PATH} backLabel="Samakan" />
        {!online && <OfflineBanner />}
        {notice && <div className="px-6 pt-4"><Notice onClose={() => setNotice(null)}>{notice}</Notice></div>}
        {ctx.closed && set.status === 'open' && (
          <div className="px-6 pt-4">
            <Notice>Your partner left this couple space, so this set can&apos;t go on. Rounds you both answered are below.</Notice>
          </div>
        )}
        <SetResults state={data} me={me} partnerName={partner} />
      </div>
    )
  }

  // ---------- open set ----------

  const currentRoundId = 'roundId' in current ? current.roundId : null
  const pendingReveal = current.kind === 'round'
    ? revealed.find((r) => !seen.has(r.id) && r.id !== current.roundId) ?? null
    : null

  let body: React.ReactNode = null

  if (current.kind === 'round') {
    const r = byId.get(current.roundId)
    if (r) {
      const picks = picksFor(r, current.editing)
      body = (
        <>
          {pendingReveal && (
            <div className="px-6 pt-4">
              <button
                type="button"
                onClick={() => setView({ kind: 'reveal', roundId: pendingReveal.id, live: false, mode: 'next' })}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-purple-100 bg-purple-50/70 px-4 py-2.5 text-left text-xs font-semibold text-purple-800"
              >
                <span className="min-w-0 break-words">Round {pendingReveal.position + 1} just opened.</span>
                <span className="shrink-0 underline underline-offset-2">See it</span>
              </button>
            </div>
          )}
          <RoundPlay
            key={r.id + (current.editing ? ':edit' : '')}
            round={r}
            partner={partner}
            value={picks}
            onChange={(next) => {
              const complete = canLockIn(r.kind, next.pick, r.kind === 'match' ? null : next.guess)
              setDraft(r.id, { ...next, queued: !online && complete && !r.mine })
              setError(null)
            }}
            onLockIn={() => void lockIn(r.id, picks)}
            onSkip={() => void skip(r.id)}
            canSkip={!current.editing && online && canSkip(r, set.skips)}
            skipsLeft={skipsLeft}
            busy={busy}
            online={online}
            editing={current.editing}
            onCancelEdit={() => { setDraft(r.id, null); setView({ kind: 'locked', roundId: r.id }) }}
            error={error}
          />
          {showPlayNow && set.progress.me === 0 && !current.editing && (
            <div className="px-6 pt-6">
              <p className="mb-2 text-xs text-ink-muted">Sitting together, or both free right now?</p>
              <PlayNowButton partner={partner} busy={liveBusy} onClick={() => void playNow()} pendingInvite={outgoing} />
            </div>
          )}
        </>
      )
    }
  } else if (current.kind === 'locked') {
    const r = byId.get(current.roundId)
    body = r ? (
      <LockedCard
        partner={partner}
        partnerHere={presence.here}
        canChange={canChange(r, set.status) && online}
        onChange={() => setView({ kind: 'round', roundId: r.id, editing: true })}
        nextLabel={nextLabelFor(autoView(seen))}
        onNext={() => setView(null)}
      >
        {error && <p role="alert" className="text-xs font-medium text-rose-dark">{error}</p>}
        {showPlayNow && <PlayNowButton partner={partner} busy={liveBusy} onClick={() => void playNow()} pendingInvite={outgoing} />}
      </LockedCard>
    ) : null
  } else if (current.kind === 'reveal') {
    const r = byId.get(current.roundId)
    if (r) {
      let nextLabel = 'Next'
      let onNext: () => void
      if (current.mode === 'replay') {
        const later = revealed.find((x) => x.position > r.position)
        nextLabel = later ? 'Next reveal' : 'Back'
        onNext = () => {
          markSeen([r.id])
          setView(later ? { kind: 'reveal', roundId: later.id, live: false, mode: 'replay' } : { kind: 'waiting' })
        }
      } else {
        const seenAfter = new Set(seen)
        seenAfter.add(r.id)
        nextLabel = nextLabelFor(autoView(seenAfter))
        onNext = () => {
          markSeen([r.id])
          setView(null)
        }
      }
      body = (
        <RoundReveal
          key={r.id}
          round={r}
          partnerName={partner}
          live={current.live}
          nextLabel={nextLabel}
          onNext={onNext}
          onSkipToResults={current.mode === 'walk'
            ? () => { markSeen(revealed.map((x) => x.id)); setView({ kind: 'results' }) }
            : undefined}
        />
      )
    }
  } else if (current.kind === 'waiting') {
    body = (
      <WaitingCard
        partner={partner}
        partnerHere={presence.here}
        partnerAnswered={set.progress.partner}
        total={set.total}
        revealedCount={revealed.length}
        onSeeReveals={() => revealed[0] && setView({ kind: 'reveal', roundId: revealed[0].id, live: false, mode: 'replay' })}
        nudgeAt={nudgeOpensAt(set)}
        nudged={set.nudged}
        now={now}
        nudging={nudging}
        onNudge={() => void nudge()}
        onEnd={() => setEnding(true)}
      >
        {error && <p role="alert" className="text-xs font-medium text-rose-dark">{error}</p>}
        {showPlayNow && <PlayNowButton partner={partner} busy={liveBusy} onClick={() => void playNow()} pendingInvite={outgoing} />}
      </WaitingCard>
    )
  }

  return (
    <div className="animate-fade-in pb-6">
      <SetTopBar title={title} rounds={rounds} currentId={currentRoundId} partnerHere={presence.here && open} partner={partner} />
      {!online && <OfflineBanner />}
      {banners}
      {body}
      <EndSetModal
        setId={ending ? set.id : null}
        onClose={() => setEnding(false)}
        onEnded={() => { setEnding(false); router.push(GAME_PATH) }}
      />
    </div>
  )
}
