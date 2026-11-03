'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Flame, MessageCircleQuestion, Repeat, Shuffle, SkipForward, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FullScreen } from './FullScreen'
import { HeatChips } from './HeatPicker'
import { TOD_HEAT_INFO, type TodHeat, type TodKind } from './deck'
import {
  canSkip, currentPlayer, findCard, skipsLeft, totalTurns,
  type PlayCard, type TodGame,
} from './engine'

const KIND_LABEL: Record<TodKind, string> = { truth: 'Truth', dare: 'Dare' }
/** Ignore taps on the new card for a moment, so a double tap on Truth can't also hit Done. */
const INPUT_LOCK_MS = 450

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

interface Props {
  game: TodGame
  cards: readonly PlayCard[]
  nameOf: (id: string) => string
  userId: string
  notice: string | null
  onDraw: (kind: TodKind) => void
  onSwap: () => void
  onFinish: (outcome: 'done' | 'skip') => void
  onHeat: (heat: TodHeat) => void
  onEnd: () => void
}

export function TodPlay({ game, cards, nameOf, userId, notice, onDraw, onSwap, onFinish, onHeat, onEnd }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [rolling, setRolling] = useState<TodKind | null>(null)
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lockUntil = useRef(0)

  const player = currentPlayer(game)
  const playerName = nameOf(player)
  const card = game.current ? findCard(cards, game.current.cardId) : null
  const heat = card?.heat ?? game.heat
  const info = TOD_HEAT_INFO[heat]
  const turnNumber = Math.min(game.turn + 1, totalTurns(game))

  useEffect(() => () => { if (rollTimer.current) clearTimeout(rollTimer.current) }, [])
  const cardId = card?.id ?? null
  useEffect(() => { if (cardId) lockUntil.current = Date.now() + INPUT_LOCK_MS }, [cardId])
  useEffect(() => {
    if (!confirmEnd) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmEnd(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmEnd])

  const locked = () => Date.now() < lockUntil.current

  const draw = useCallback((kind: TodKind) => {
    if (rolling) return
    onDraw(kind)
  }, [rolling, onDraw])

  // Random: flick between the two a few times, then land on one (an odd
  // tick count ends on Truth, an even one on Dare).
  const showingCard = !!game.current
  const pickForMe = useCallback(() => {
    if (rolling || showingCard) return
    const final: TodKind = Math.random() < 0.5 ? 'truth' : 'dare'
    if (prefersReducedMotion()) { onDraw(final); return }
    let ticks = 0
    const total = final === 'truth' ? 7 : 8
    const step = () => {
      ticks += 1
      const kind: TodKind = ticks % 2 === 1 ? 'truth' : 'dare'
      setRolling(kind)
      if (ticks >= total) {
        rollTimer.current = setTimeout(() => { setRolling(null); onDraw(final) }, 260)
        return
      }
      rollTimer.current = setTimeout(step, 70 + ticks * 18)
    }
    step()
  }, [rolling, showingCard, onDraw])

  const skips = skipsLeft(game, player)
  const author = card?.custom && card.authorId ? card.authorId : null

  return (
    <FullScreen background={info.soft} label="Truth or Dare">
      {/* Top bar: leave, scores, turn */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top),1rem)]">
        <button
          type="button"
          onClick={() => setConfirmEnd(true)}
          aria-label="End game"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
        >
          <X className="h-4 w-4 text-ink" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          {game.players.map((id) => {
            const active = id === player
            return (
              <div
                key={id}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
                  active ? 'bg-white text-ink shadow-card' : 'bg-white/50 text-ink-muted',
                )}
              >
                <span className="max-w-[5.5rem] truncate">{nameOf(id)}</span>
                <span key={game.points[id]} className="tabular-nums motion-safe:animate-scale-in" style={active ? { color: info.color } : undefined}>
                  {game.points[id] ?? 0}
                </span>
                <span className="sr-only">{(game.points[id] ?? 0) === 1 ? 'point' : 'points'}</span>
              </div>
            )
          })}
        </div>
        <span className="w-10 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-ink-muted">
          <span className="sr-only">Turn </span>{turnNumber}/{totalTurns(game)}
        </span>
      </div>

      {/* Floats over the content so the layout doesn't jump when it appears. */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(env(safe-area-inset-top),1rem)+3.25rem)] z-10 flex justify-center px-6" role="status">
        {notice && (
          <p className="max-w-[20rem] rounded-2xl bg-ink/85 px-4 py-2 text-center text-xs font-medium text-white shadow-elevated motion-safe:animate-fade-in">
            {notice}
          </p>
        )}
      </div>

      {!card ? (
        // Pick: whose turn, Truth or Dare. Keyed by turn so each new turn fades in.
        <div key={game.turn} className="flex flex-1 flex-col items-center justify-center px-6 py-6 text-center motion-safe:animate-fade-in">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-extrabold text-white shadow-elevated"
            style={{ backgroundColor: info.color }}
            aria-hidden
          >
            {playerName.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <h2 className="mt-3 max-w-full break-words text-3xl font-extrabold text-ink">{playerName}&apos;s turn</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {player === userId ? 'Truth or dare?' : `Truth or dare, ${playerName}?`}
          </p>

          <div className="mt-8 grid w-full grid-cols-2 gap-3">
            {(['truth', 'dare'] as const).map((kind) => {
              const highlighted = rolling === kind
              const Icon = kind === 'truth' ? MessageCircleQuestion : Flame
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => draw(kind)}
                  disabled={!!rolling}
                  className={cn(
                    'flex h-36 flex-col items-center justify-center gap-2 rounded-3xl bg-white shadow-elevated transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:cursor-default',
                    { 'scale-[1.04]': highlighted, 'opacity-60': !!rolling && !highlighted },
                  )}
                  style={highlighted ? { boxShadow: `0 0 0 3px ${info.color}` } : undefined}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: info.soft, color: info.color }}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="text-lg font-extrabold text-ink">{KIND_LABEL[kind]}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={pickForMe}
            disabled={!!rolling}
            className="mt-4 flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink-light transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:opacity-60"
          >
            <Shuffle className="h-4 w-4" /> {rolling ? 'Picking...' : 'Random'}
          </button>

          <div className="mt-8">
            <HeatChips value={game.heat} onChange={onHeat} disabled={!!rolling} />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {skips === 0 ? `${playerName} has no skips left` : `${playerName} has ${skips} skip${skips === 1 ? '' : 's'} left`}
          </p>
        </div>
      ) : (
        // Card: read it, then Done, Skip or Swap
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-4">
            <div aria-live="polite" className="w-full">
              <CardFace key={card.id} card={card} color={info.color} soft={info.soft} heatName={info.name} author={author ? nameOf(author) : null} />
            </div>
            <p className="mt-4 text-center text-xs text-ink-muted">
              {card.kind === 'truth' ? `${playerName} answers this one.` : `${playerName} does this one.`}
            </p>
          </div>

          <div className="space-y-3 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
            <button
              type="button"
              onClick={() => { if (!locked()) onFinish('done') }}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-elevated transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rose/40"
              style={{ backgroundColor: info.color }}
            >
              <Check className="h-5 w-5" strokeWidth={3} /> Done
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">+1</span>
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { if (!locked()) onFinish('skip') }}
                disabled={!canSkip(game)}
                className="flex min-h-[52px] flex-col items-center justify-center rounded-2xl border border-border bg-white px-2 text-sm font-semibold text-ink transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5"><SkipForward className="h-4 w-4" /> Skip</span>
                <span className="text-[11px] font-medium text-ink-muted">{skips === 0 ? 'None left' : `${skips} left`}</span>
              </button>
              <button
                type="button"
                onClick={() => { if (!locked()) onSwap() }}
                disabled={game.current?.swapped}
                className="flex min-h-[52px] flex-col items-center justify-center rounded-2xl border border-border bg-white px-2 text-sm font-semibold text-ink transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5"><Repeat className="h-4 w-4" /> Swap</span>
                <span className="text-[11px] font-medium text-ink-muted">{game.current?.swapped ? 'Used this turn' : `Another ${card.kind}`}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {confirmEnd && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-sm motion-safe:animate-fade-in" onClick={() => setConfirmEnd(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tod-end-title"
            className="w-full max-w-lg rounded-t-3xl bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 text-center motion-safe:animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="tod-end-title" className="text-lg font-bold text-ink">End this game?</p>
            <p className="mt-1 text-sm text-ink-muted">You&apos;ll see the scores so far.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="min-h-[48px] rounded-2xl border border-border text-sm font-semibold text-ink-light active:scale-[0.98]"
              >
                Keep playing
              </button>
              <button
                type="button"
                onClick={() => { setConfirmEnd(false); onEnd() }}
                className="min-h-[48px] rounded-2xl bg-rose text-sm font-bold text-white shadow-elevated active:scale-[0.98]"
              >
                End game
              </button>
            </div>
          </div>
        </div>
      )}
    </FullScreen>
  )
}

/** The card itself. Keyed by card id, so every new card flips in. */
function CardFace({ card, color, soft, heatName, author }: { card: PlayCard; color: string; soft: string; heatName: string; author: string | null }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="[perspective:900px]">
      <div
        className={cn(
          'flex min-h-[260px] w-full flex-col rounded-3xl bg-white p-6 shadow-elevated transition-all duration-500 ease-out motion-reduce:transition-none',
          shown ? 'opacity-100 [transform:none]' : 'opacity-0 [transform:rotateY(70deg)_scale(0.94)]',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white" style={{ backgroundColor: color }}>
            {KIND_LABEL[card.kind]}
          </span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: soft, color }}>
            {heatName}
          </span>
        </div>
        <p className="flex flex-1 items-center justify-center break-words py-6 text-center text-xl font-bold leading-snug text-ink">
          {card.body}
        </p>
        {card.custom && (
          <p className="text-center text-xs font-semibold" style={{ color }}>
            {author ? `From ${author}` : 'One of your own cards'}
          </p>
        )}
      </div>
    </div>
  )
}
