'use client'

import { Crown, RotateCcw, Settings2, Trophy } from 'lucide-react'
import { FullScreen } from './FullScreen'
import { TOD_HEAT_INFO } from './deck'
import { leader, type TodGame } from './engine'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

interface Props {
  game: TodGame
  nameOf: (id: string) => string
  onPlayAgain: () => void
  onSettings: () => void
  onLeave: () => void
}

export function TodEnd({ game, nameOf, onPlayAgain, onSettings, onLeave }: Props) {
  const info = TOD_HEAT_INFO[game.heat]
  const winner = leader(game)
  const [a, b] = game.players
  const pa = game.points[a] ?? 0
  const pb = game.points[b] ?? 0
  const played = game.truthsDone + game.daresDone + game.skipped

  let title: string
  let line: string
  if (played === 0) {
    title = 'Game over'
    line = 'No cards were played this time.'
  } else if (winner) {
    title = `${nameOf(winner)} wins`
    line = `${Math.max(pa, pb)} to ${Math.min(pa, pb)}`
  } else {
    title = "It's a tie"
    line = pa === 0 ? 'Nobody scored this time.' : `${plural(pa, 'point', 'points')} each`
  }

  const stats = [
    { label: 'Truths answered', value: game.truthsDone },
    { label: 'Dares done', value: game.daresDone },
    { label: 'Skipped', value: game.skipped },
  ]

  return (
    <FullScreen background={info.soft} label="Game over">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-6 pt-[max(env(safe-area-inset-top),2.5rem)] text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-white shadow-elevated motion-safe:animate-scale-in"
          style={{ backgroundColor: info.color }}
        >
          <Trophy className="h-9 w-9" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 max-w-full break-words text-3xl font-extrabold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{line}</p>

        <div className="mt-7 grid w-full grid-cols-2 gap-3">
          {game.players.map((id) => {
            const top = winner === id
            return (
              <div key={id} className="relative rounded-2xl bg-white px-3 py-4 shadow-card" style={top ? { boxShadow: `0 0 0 2px ${info.color}` } : undefined}>
                {top && (
                  <span className="absolute -top-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-white" style={{ backgroundColor: info.color }}>
                    <Crown className="h-3.5 w-3.5" />
                  </span>
                )}
                <p className="truncate text-sm font-semibold text-ink-light">{nameOf(id)}</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink">{game.points[id] ?? 0}</p>
                <p className="text-[11px] text-ink-muted">{(game.points[id] ?? 0) === 1 ? 'point' : 'points'}</p>
              </div>
            )
          })}
        </div>

        <dl className="mt-4 grid w-full grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/70 px-2 py-2.5">
              <dt className="text-[11px] text-ink-muted">{s.label}</dt>
              <dd className="text-base font-bold tabular-nums text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-3 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white shadow-elevated transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          style={{ backgroundColor: info.color }}
        >
          <RotateCcw className="h-4 w-4" /> Play again
        </button>
        <p className="text-center text-[11px] text-ink-muted">Next game, {nameOf(b)} goes first and the cards stay fresh.</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onSettings}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-border bg-white text-sm font-semibold text-ink-light active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            <Settings2 className="h-4 w-4" /> Settings
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="min-h-[48px] rounded-2xl border border-border bg-white text-sm font-semibold text-ink-light active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            Back to Games
          </button>
        </div>
      </div>
    </FullScreen>
  )
}
