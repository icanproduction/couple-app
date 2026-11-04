'use client'

// "Older games": completed games from the first version of Samakan (the live
// lobby), read-only. Built from game_sessions.rounds, where each round holds
// its config plus hostAnswer and guestAnswer. Nothing here writes.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, History, SearchX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import GameHeader from '@/components/games/two-truths/GameHeader'
import { GameSkeleton, LoadErrorCard, StateCard } from '@/components/games/two-truths/StateCard'
import { getChapter } from '@/data/samakan'
import { loadContext, loadMessage, loadOlderGame, loadOlderGames, type SamakanContext } from '@/lib/samakan'
import { GAME_PATH } from './logic'
import { cap, partnerLabel, shortDate } from './ui'
import type { GameSession, RoundConfig, RoundResult } from '@/types/samakan'

const OLDER_PATH = `${GAME_PATH}/older`
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function title(game: GameSession): string {
  return getChapter(game.chapter_id)?.title ?? 'Older game'
}

/** The stored score as it was shown back then. */
function percent(game: GameSession): number | null {
  const max = (game.rounds?.length ?? 0) * 20
  return max > 0 ? Math.round((game.total_score / max) * 100) : null
}

function question(config: RoundConfig | undefined): string {
  if (!config) return ''
  switch (config.type) {
    case 'pilih_sama': return config.storyPrompt
    case 'slider_sama': return config.question
    case 'tebak_angka': return config.question
    case 'tebak_pasangan': return config.questionForSelf
    default: return ''
  }
}

function answerParts(r: RoundResult, answer: unknown): { pick: string; guess: string | null } {
  if (r.type === 'tebak_pasangan') {
    const a = (answer && typeof answer === 'object' ? answer : {}) as { real?: unknown; guess?: unknown }
    return {
      pick: typeof a.real === 'string' ? a.real : '',
      guess: typeof a.guess === 'string' ? a.guess : null,
    }
  }
  if (typeof answer === 'string' || typeof answer === 'number') return { pick: String(answer), guess: null }
  return { pick: '', guess: null }
}

function rangeNote(config: RoundConfig | undefined): string | null {
  if (config?.type === 'slider_sama') return `1 is ${config.minLabel}, 10 is ${config.maxLabel}`
  if (config?.type === 'tebak_angka') return 'A number from 1 to 10'
  return null
}

function useOlder<T>(fetcher: (ctx: SamakanContext) => Promise<T>) {
  const router = useRouter()
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; ctx: SamakanContext; data: T }>({ status: 'loading' })
  const run = useRef(fetcher)
  run.current = fetcher
  const load = useCallback(async () => {
    try {
      const ctx = await loadContext()
      if (!ctx) { router.replace('/auth/login'); return }
      const data = await run.current(ctx)
      setState({ status: 'ready', ctx, data })
    } catch (e) {
      console.error('[samakan] older games load failed', e)
      setState({ status: 'error', message: loadMessage(e) })
    }
  }, [router])
  useEffect(() => { void load() }, [load])
  const retry = () => { setState({ status: 'loading' }); void load() }
  return { state, retry }
}

export function OlderGamesList() {
  const { state, retry } = useOlder((ctx) => (ctx.coupleId ? loadOlderGames(ctx.coupleId) : Promise.resolve([])))
  const header = <GameHeader title="Older games" subtitle="From the first version of Samakan." backHref={GAME_PATH} backLabel="Samakan" />

  if (state.status === 'loading') return <GameSkeleton cards={3} />
  if (state.status === 'error') return <div className="pb-6">{header}<LoadErrorCard message={state.message} onRetry={retry} /></div>
  const games = state.data
  return (
    <div className="animate-fade-in pb-6">
      {header}
      {games.length === 0 ? (
        <StateCard icon={History} title="No older games" body="Games from the first version of Samakan show up here once they were finished.">
          <Link href={GAME_PATH} className={buttonVariants()}>Back to Samakan</Link>
        </StateCard>
      ) : (
        <div className="px-6 pt-5">
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            {games.map((g, i) => {
              const pct = percent(g)
              return (
                <Link
                  key={g.id}
                  href={`${GAME_PATH}/${g.id}`}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-cream ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{title(g)}</span>
                    <span className="block text-xs text-ink-muted">{shortDate(g.completed_at ?? g.created_at)}</span>
                  </span>
                  {pct !== null && <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted">{pct}%</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function OlderGameView({ sessionId }: { sessionId: string }) {
  const { state, retry } = useOlder(() => (UUID_RE.test(sessionId) ? loadOlderGame(sessionId) : Promise.resolve(null)))
  const back = <GameHeader title="Older game" backHref={OLDER_PATH} backLabel="Older games" />

  if (state.status === 'loading') return <GameSkeleton cards={4} />
  if (state.status === 'error') return <div className="pb-6">{back}<LoadErrorCard message={state.message} onRetry={retry} /></div>
  const game = state.data
  if (!game) {
    return (
      <div className="pb-6">
        {back}
        <StateCard icon={SearchX} title="This game isn't here anymore" body="It may have been removed along with an account.">
          <Link href={GAME_PATH} className={buttonVariants()}>Back to Samakan</Link>
        </StateCard>
      </div>
    )
  }
  if (game.status !== 'completed') {
    return (
      <div className="pb-6">
        {back}
        <StateCard icon={History} title="This game never finished" body="It's from the first version of Samakan, so there's nothing to show. Start a new set instead.">
          <Link href={GAME_PATH} className={buttonVariants()}>Back to Samakan</Link>
        </StateCard>
      </div>
    )
  }

  const { ctx } = state
  const nameOf = (id: string | null) => {
    if (id && id === ctx.userId) return ctx.myName ?? 'You'
    if (id && id === ctx.partner?.id) return cap(partnerLabel(ctx.partner?.name))
    return 'Your partner'
  }
  const host = nameOf(game.created_by)
  const guest = nameOf(game.partner_id)
  const pct = percent(game)
  const rounds = [...(game.rounds ?? [])].filter((r) => r && typeof r.roundIndex === 'number').sort((a, b) => a.roundIndex - b.roundIndex)

  return (
    <div className="animate-fade-in pb-6">
      <GameHeader
        title={title(game)}
        subtitle={`${shortDate(game.completed_at ?? game.created_at)}${pct !== null ? ` · ${pct}%` : ''}`}
        backHref={OLDER_PATH}
        backLabel="Older games"
      />
      <div className="px-6 pt-5">
        <p className="rounded-2xl border border-border bg-cream px-4 py-3 text-xs leading-relaxed text-ink-light">
          From the first version of Samakan. It&apos;s here to look back on.
        </p>
        <ol className="mt-4 space-y-3">
          {rounds.map((r) => {
            const note = rangeNote(r.config)
            const rows = [
              { who: host, ...answerParts(r, r.hostAnswer) },
              { who: guest, ...answerParts(r, r.guestAnswer) },
            ]
            return (
              <li key={r.roundIndex} className="rounded-2xl border border-border bg-white p-4 shadow-card">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-purple-600">{r.roundIndex + 1}</span>
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-ink">{question(r.config) || 'Round'}</p>
                </div>
                {note && <p className="mt-0.5 pl-5 text-[11px] text-ink-muted">{note}</p>}
                <div className="mt-2 space-y-1.5 pl-5">
                  {rows.map((row, i) => (
                    <p key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="min-w-0 max-w-full truncate text-[11px] font-bold uppercase tracking-wider text-ink-muted">{row.who}</span>
                      <span className="min-w-0 break-words font-semibold text-ink">{row.pick || 'No answer'}</span>
                      {row.guess && <span className="min-w-0 break-words text-xs text-ink-muted">guessed {row.guess}</span>}
                    </p>
                  ))}
                </div>
              </li>
            )
          })}
        </ol>
        <Link href={GAME_PATH} className={buttonVariants({ variant: 'secondary', className: 'mt-5' })}>Back to Samakan</Link>
      </div>
    </div>
  )
}
