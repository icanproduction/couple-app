'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, PenLine, Play, RefreshCw, Shuffle, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { TOD_DECK, TOD_HEAT_INFO, type TodHeat, type TodKind } from '@/components/games/truth-or-dare/deck'
import {
  DEFAULT_TURNS, SKIPS_PER_PLAYER, TURN_CHOICES,
  currentPlayer, drawCard, endGame, finishTurn, isOver, newGame, playAgain, restoreGame, setHeat, swapCard, totalTurns,
  type PlayCard, type TodGame,
} from '@/components/games/truth-or-dare/engine'
import { listCustomCards, toPlayCard, type CustomCardRow } from '@/components/games/truth-or-dare/cards-api'
import { loadTodCouple, type TodCouple } from '@/components/games/truth-or-dare/couple'
import { HeatOptions } from '@/components/games/truth-or-dare/HeatPicker'
import { CustomCardsSheet } from '@/components/games/truth-or-dare/CustomCardsSheet'
import { TodPlay } from '@/components/games/truth-or-dare/TodPlay'
import { TodEnd } from '@/components/games/truth-or-dare/TodEnd'

type Status = 'loading' | 'nocouple' | 'error' | 'ready'
type Starter = 'me' | 'partner' | 'random'

const BUILT_IN: readonly PlayCard[] = TOD_DECK.map((c) => ({ ...c, custom: false, authorId: null }))

/** A game in progress survives a reload or a locked phone (this tab only). */
function storageKey(coupleId: string): string {
  return 'nk:truth-or-dare:' + coupleId
}

function readSaved(coupleId: string): unknown {
  try {
    const raw = sessionStorage.getItem(storageKey(coupleId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSaved(coupleId: string, game: TodGame | null) {
  try {
    if (game && !isOver(game)) sessionStorage.setItem(storageKey(coupleId), JSON.stringify(game))
    else sessionStorage.removeItem(storageKey(coupleId))
  } catch {
    // Private mode or full storage: the game still works, it just won't survive a reload.
  }
}

export default function TruthOrDarePage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const [couple, setCouple] = useState<TodCouple | null>(null)

  const [customRows, setCustomRows] = useState<CustomCardRow[]>([])
  const [customState, setCustomState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [sheetOpen, setSheetOpen] = useState(false)

  const [heat, setHeatChoice] = useState<TodHeat>('sweet')
  const [turnsEach, setTurnsEach] = useState<number>(DEFAULT_TURNS)
  const [starter, setStarter] = useState<Starter>('random')

  const [game, setGame] = useState<TodGame | null>(null)
  const [resumable, setResumable] = useState<TodGame | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Cards drawn this visit, carried into the next game so it doesn't repeat them.
  const seenRef = useRef<Record<string, string[]>>({})
  const restoredRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    loadTodCouple()
      .then((res) => {
        if (cancelled) return
        if (res.status === 'signedout') { router.replace('/auth/login'); return }
        if (res.status === 'nocouple') { setStatus('nocouple'); return }
        setCouple(res.couple)
        setStatus('ready')
      })
      .catch((err) => {
        console.error('[truth-or-dare] load failed:', err)
        if (!cancelled) setStatus('error')
      })
    return () => { cancelled = true }
  }, [router, attempt])

  const canPlay = !!couple && !!couple.partnerId && !couple.closed

  const loadCustom = useCallback(async () => {
    if (!couple || !canPlay) return
    setCustomState('loading')
    try {
      setCustomRows(await listCustomCards(couple.coupleId))
      setCustomState('ready')
    } catch (err) {
      console.error('[truth-or-dare] custom cards failed:', err)
      setCustomState('error')
    }
  }, [couple, canPlay])

  useEffect(() => { void loadCustom() }, [loadCustom])

  const cards = useMemo<readonly PlayCard[]>(() => [...BUILT_IN, ...customRows.map(toPlayCard)], [customRows])

  // Offer to resume a game left in this tab, once the custom cards are in.
  useEffect(() => {
    if (!couple || !canPlay || customState === 'loading' || restoredRef.current) return
    restoredRef.current = true
    const players = [couple.userId, couple.partnerId as string]
    const saved = restoreGame(readSaved(couple.coupleId), players, cards)
    if (saved && !isOver(saved)) setResumable(saved)
    else writeSaved(couple.coupleId, null)
  }, [couple, canPlay, customState, cards])

  useEffect(() => {
    if (couple && game) writeSaved(couple.coupleId, game)
  }, [couple, game])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const nameOf = useCallback((id: string) => {
    if (!couple) return 'Player'
    return couple.names[id] ?? (id === couple.userId ? 'Player 1' : 'Player 2')
  }, [couple])

  // Handlers read the latest game from a ref: a card drawn after the Random
  // animation must see the state as it is then, not as it was on the tap.
  const gameRef = useRef<TodGame | null>(null)
  gameRef.current = game

  function track(next: TodGame | null) {
    if (next) seenRef.current = next.seen
    gameRef.current = next
    setGame(next)
  }

  /** Apply one move; a move the rules refuse (double tap, stale button) changes nothing. */
  const apply = useCallback((move: (g: TodGame) => TodGame) => {
    const g = gameRef.current
    if (!g) return
    const next = move(g)
    if (next === g) return
    seenRef.current = next.seen
    gameRef.current = next
    setGame(next)
  }, [])

  function start() {
    if (!couple?.partnerId) return
    const me = couple.userId
    const them = couple.partnerId
    const meFirst = starter === 'me' || (starter === 'random' && Math.random() < 0.5)
    setResumable(null)
    track(newGame(meFirst ? [me, them] : [them, me], heat, turnsEach, seenRef.current))
  }

  function resume() {
    if (!resumable) return
    const g = resumable
    setResumable(null)
    setHeatChoice(g.heat)
    setTurnsEach(g.turnsEach)
    track(g)
  }

  function discardResumable() {
    if (couple) writeSaved(couple.coupleId, null)
    setResumable(null)
  }

  const reshuffleNotice = useCallback((h: TodHeat, kind: TodKind) => {
    setNotice(`You've seen every ${TOD_HEAT_INFO[h].name} ${kind}. Shuffling them back in.`)
  }, [])

  const onDraw = useCallback((kind: TodKind) => {
    apply((g) => {
      const res = drawCard(g, cards, kind)
      if (res.reshuffled) reshuffleNotice(g.heat, kind)
      return res.game
    })
  }, [apply, cards, reshuffleNotice])

  const onSwap = useCallback(() => {
    apply((g) => {
      const res = swapCard(g, cards)
      if (res.reshuffled && g.current) reshuffleNotice(g.heat, g.current.kind)
      return res.game
    })
  }, [apply, cards, reshuffleNotice])

  const onFinish = useCallback((outcome: 'done' | 'skip') => {
    apply((g) => finishTurn(g, outcome))
    if (outcome === 'done') {
      try { navigator.vibrate?.(12) } catch { /* not supported */ }
    }
  }, [apply])

  const onHeat = useCallback((next: TodHeat) => {
    setHeatChoice(next)
    apply((g) => setHeat(g, next))
  }, [apply])

  const onEnd = useCallback(() => apply(endGame), [apply])

  // ------------------------------------------------------------------ render

  const header = (
    <div className="border-b border-border bg-white px-6 py-5">
      <button
        type="button"
        onClick={() => router.push('/app/games')}
        className="-ml-1 mb-3 flex min-h-[32px] items-center gap-1 rounded-lg px-1 text-sm text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
      >
        <ArrowLeft className="h-4 w-4" /> Games
      </button>
      <h1 className="text-xl font-bold text-ink">Truth or Dare</h1>
      <p className="text-sm text-ink-muted">Take turns on one phone, side by side or on a call</p>
    </div>
  )

  if (status === 'loading') {
    return (
      <div className="pb-6" aria-busy="true">
        {header}
        <div className="space-y-3 px-6 pt-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="pb-6">
        {header}
        <div className="px-8 pt-16 text-center">
          <p className="text-sm text-ink-muted">Couldn&apos;t load the game. Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 px-4 text-sm font-semibold text-rose"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    )
  }

  if (status === 'nocouple' || !couple) {
    return (
      <div className="pb-6">
        {header}
        <EmptyState
          title="Connect with your partner first"
          body="Truth or Dare is for the two of you. Link your accounts, then come back to play."
          href="/app/profile"
          cta="Go to Profile"
        />
      </div>
    )
  }

  if (couple.closed) {
    return (
      <div className="pb-6">
        {header}
        <EmptyState
          title="This couple is closed"
          body="Truth or Dare needs both of you, so there's nothing to play here. What you made together stays in your Memory archive."
          href="/app/games"
          cta="Back to Games"
        />
      </div>
    )
  }

  if (!couple.partnerId) {
    return (
      <div className="pb-6">
        {header}
        <EmptyState
          title="Waiting for your partner"
          body="Truth or Dare needs two players. Share your invite code from your profile, and the game opens as soon as they join."
          href="/app/profile"
          cta="Share invite code"
        />
      </div>
    )
  }

  const me = couple.userId
  const them = couple.partnerId
  const mineCount = customRows.filter((r) => r.created_by === me).length
  const theirsCount = customRows.length - mineCount
  const starterOptions: { value: Starter; label: string }[] = [
    { value: 'me', label: nameOf(me) },
    { value: 'partner', label: nameOf(them) },
    { value: 'random', label: 'Toss a coin' },
  ]

  return (
    <div className="pb-6">
      {header}

      <div className="space-y-6 px-6 pt-5">
        {resumable && (
          <div className="rounded-2xl border border-rose/25 bg-rose-50 p-4 motion-safe:animate-fade-in">
            <p className="text-sm font-bold text-ink">Game in progress</p>
            <p className="mt-0.5 text-xs text-ink-light">
              {resumable.players.map((id) => `${nameOf(id)} ${resumable.points[id] ?? 0}`).join(' · ')}, turn {resumable.turn + 1} of {totalTurns(resumable)}. {nameOf(currentPlayer(resumable))} is up.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={resume}>
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
              <Button size="sm" variant="secondary" onClick={discardResumable}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {/* Players */}
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-white px-4 py-4 shadow-card">
          <PlayerBadge name={nameOf(me)} tone="rose" />
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">vs</span>
          <PlayerBadge name={nameOf(them)} tone="gold" />
        </div>

        <section aria-labelledby="tod-heat">
          <h2 id="tod-heat" className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Heat</h2>
          <HeatOptions value={heat} onChange={setHeatChoice} />
          <p className="mt-2 text-[11px] text-ink-muted">You can change it between turns.</p>
        </section>

        <section aria-labelledby="tod-length">
          <h2 id="tod-length" className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Turns each</h2>
          <div role="radiogroup" aria-labelledby="tod-length" className="grid grid-cols-3 gap-2">
            {TURN_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={turnsEach === n}
                onClick={() => setTurnsEach(n)}
                className={cn(
                  'min-h-[44px] rounded-xl border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40',
                  turnsEach === n ? 'border-rose bg-rose-50 text-rose-dark' : 'border-border bg-white text-ink-muted',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="tod-starter">
          <h2 id="tod-starter" className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Who starts</h2>
          <div role="radiogroup" aria-labelledby="tod-starter" className="grid grid-cols-3 gap-2">
            {starterOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={starter === o.value}
                onClick={() => setStarter(o.value)}
                className={cn(
                  'flex min-h-[44px] min-w-0 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40',
                  starter === o.value ? 'border-rose bg-rose-50 text-rose-dark' : 'border-border bg-white text-ink-muted',
                )}
              >
                {o.value === 'random' && <Shuffle className="h-3.5 w-3.5 flex-shrink-0" />}
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition-all hover:border-rose/30 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold/20 text-yellow-700">
            <PenLine className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">Your own cards</span>
            <span className="block text-xs text-ink-muted">
              {customState === 'loading'
                ? 'Loading...'
                : customState === 'error'
                  ? "Couldn't load them. The built-in deck still works."
                  : customRows.length === 0
                    ? 'Write truths and dares only you two would get'
                    : `${mineCount} by you, ${theirsCount} by ${nameOf(them)}. They mix into the deck.`}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
        </button>

        <div>
          <Button size="lg" onClick={start}>
            <Play className="h-4 w-4" /> {resumable ? 'Start a new game' : 'Start game'}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">
            Take turns picking truth or dare. Done earns a point. Each of you gets {SKIPS_PER_PLAYER} skips per game and one swap per turn.
          </p>
        </div>
      </div>

      <CustomCardsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        coupleId={couple.coupleId}
        userId={me}
        partnerName={nameOf(them)}
        rows={customRows}
        state={customState}
        onRetry={() => { void loadCustom() }}
        onAdded={(row) => setCustomRows((rows) => [row, ...rows.filter((r) => r.id !== row.id)])}
        onDeleted={(id) => setCustomRows((rows) => rows.filter((r) => r.id !== id))}
      />

      {game && !isOver(game) && (
        <TodPlay
          game={game}
          cards={cards}
          nameOf={nameOf}
          userId={me}
          notice={notice}
          onDraw={onDraw}
          onSwap={onSwap}
          onFinish={onFinish}
          onHeat={onHeat}
          onEnd={onEnd}
        />
      )}
      {game && isOver(game) && (
        <TodEnd
          game={game}
          nameOf={nameOf}
          onPlayAgain={() => track(playAgain(game))}
          onSettings={() => track(null)}
          onLeave={() => { track(null); router.push('/app/games') }}
        />
      )}
    </div>
  )
}

function PlayerBadge({ name, tone }: { name: string; tone: 'rose' | 'gold' }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <span
        className={cn('flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold', {
          'bg-rose-50 text-rose': tone === 'rose',
          'bg-gold/20 text-yellow-700': tone === 'gold',
        })}
        aria-hidden
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="max-w-full truncate text-sm font-bold text-ink">{name}</span>
    </div>
  )
}

function EmptyState({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="px-8 pt-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/20 text-yellow-700">
        <Users className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      <Link
        href={href}
        className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-rose px-6 text-sm font-semibold text-white shadow-elevated active:scale-[0.98]"
      >
        {cta}
      </Link>
    </div>
  )
}
