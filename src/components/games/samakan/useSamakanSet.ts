'use client'

// Loads one set for the set screen and keeps it fresh. The server is the only
// source of truth: every realtime ping on the set row (or its live invites)
// refetches samakan_set_state. A response older than what's on screen (lower
// version) is dropped, so a slow refetch can't undo an answer just saved.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { codeFor, loadContext, loadSetState, messageFor, useSamakanRealtime, type SamakanContext } from '@/lib/samakan'
import type { SamakanAnswerResult, SamakanSetState } from '@/types/samakan'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A first load that failed, in words (the answer-saving text doesn't fit here). */
export function loadErrorText(e: unknown): string {
  return codeFor(e) === 'NETWORK'
    ? 'Check your connection and try again. Picks you already made are saved on this phone.'
    : messageFor(e)
}

export type SetLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'no-partner' }
  | { status: 'ready'; ctx: SamakanContext; data: SamakanSetState }

export function useSamakanSet(setId: string) {
  const router = useRouter()
  const [load, setLoad] = useState<SetLoad>({ status: 'loading' })
  const seq = useRef(0)
  const ctxRef = useRef<SamakanContext | null>(null)
  const dataRef = useRef<SamakanSetState | null>(null)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    if (!UUID_RE.test(setId)) { setLoad({ status: 'missing' }); return }
    try {
      const ctx = ctxRef.current ?? await loadContext()
      if (mine !== seq.current) return
      if (!ctx) { router.replace('/auth/login'); return }
      ctxRef.current = ctx
      if (!ctx.coupleId) { setLoad({ status: 'no-partner' }); return }
      const data = await loadSetState(setId)
      if (mine !== seq.current) return
      const current = dataRef.current
      if (current && data.set.version < current.set.version) return
      dataRef.current = data
      setLoad({ status: 'ready', ctx, data })
    } catch (e) {
      if (mine !== seq.current) return
      if (codeFor(e) === 'SK_NOT_FOUND') {
        dataRef.current = null
        setLoad({ status: 'missing' })
        return
      }
      console.error('[samakan] set load failed', e)
      // A failed background refetch keeps the last good state on screen.
      if (dataRef.current) return
      setLoad({ status: 'error', message: loadErrorText(e) })
    }
  }, [router, setId])

  useEffect(() => { void reload() }, [reload])

  // A first load that failed offline tries again once the phone is back.
  useEffect(() => {
    const onOnline = () => { if (!dataRef.current) void reload() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [reload])

  useSamakanRealtime(load.status === 'ready' ? { setId } : null, () => { void reload() })

  /** Apply a change the server just confirmed, before the refetch lands. */
  const patch = useCallback((fn: (d: SamakanSetState) => SamakanSetState) => {
    const cur = dataRef.current
    const ctx = ctxRef.current
    if (!cur || !ctx) return
    const next = fn(cur)
    dataRef.current = next
    setLoad({ status: 'ready', ctx, data: next })
  }, [])

  const retry = useCallback(() => {
    dataRef.current = null
    setLoad({ status: 'loading' })
    void reload()
  }, [reload])

  return { load, reload, patch, retry }
}

/** My answer as samakan_answer confirmed it, folded into the set state. */
export function withAnswer(d: SamakanSetState, roundId: string, res: SamakanAnswerResult, me: string): SamakanSetState {
  const at = new Date().toISOString()
  const before = d.rounds.find((r) => r.id === roundId)
  const wasNew = !before?.mine
  return {
    ...d,
    rounds: d.rounds.map((r) => (r.id !== roundId ? r : {
      ...r,
      mine: { pick: res.mine.pick, guess: res.mine.guess, answeredAt: r.mine?.answeredAt ?? at, updatedAt: at },
      partner: res.partner ?? r.partner,
      partnerAnswered: res.revealed || r.partnerAnswered,
      revealed: res.revealed || r.revealed,
      revealedAt: res.revealed ? at : r.revealedAt,
      score: res.score ?? r.score,
      learned: res.learned ?? r.learned,
    })),
    set: {
      ...d.set,
      version: Math.max(d.set.version, res.version),
      matches: res.matches,
      maxMatches: res.maxMatches,
      revealed: res.revealed ? d.set.revealed + 1 : d.set.revealed,
      learned: res.revealed ? d.set.learned + (res.learned ?? 0) : d.set.learned,
      progress: { ...d.set.progress, me: wasNew && !res.changed ? d.set.progress.me + 1 : d.set.progress.me },
      status: res.done ? 'done' : d.set.status,
      finishedAt: res.done ? at : d.set.finishedAt,
      finishedBy: res.done ? me : d.set.finishedBy,
    },
  }
}

/** A skip samakan_skip confirmed. */
export function withSkip(d: SamakanSetState, roundId: string, me: string, done: boolean, version: number | null): SamakanSetState {
  const at = new Date().toISOString()
  return {
    ...d,
    rounds: d.rounds.map((r) => (r.id !== roundId ? r : { ...r, skipped: true, skippedBy: me })),
    set: {
      ...d.set,
      version: Math.max(d.set.version, version ?? d.set.version + 1),
      skips: d.set.skips + 1,
      total: Math.max(0, d.set.total - 1),
      status: done ? 'done' : d.set.status,
      finishedAt: done ? at : d.set.finishedAt,
      finishedBy: done ? me : d.set.finishedBy,
    },
  }
}
