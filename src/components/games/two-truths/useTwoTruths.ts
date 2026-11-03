'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCoupleRealtime } from '@/lib/realtime'
import { loadGameContext, listRounds, TwoTruthsError, type GameContext } from './api'
import { errorCode, errorText, partnerLabel, type RoundList } from './logic'

export type GameState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** No couple yet, or the partner hasn't joined. */
  | { status: 'no-partner'; ctx: GameContext }
  | { status: 'ready'; ctx: GameContext; list: RoundList; partnerName: string }

/**
 * Loads who's playing and every round, and reloads when the partner does
 * something (their create/guess writes an activity row) or the app comes back
 * into view. A failed background reload keeps the last good data on screen.
 */
export function useTwoTruths() {
  const router = useRouter()
  const [state, setState] = useState<GameState>({ status: 'loading' })
  const seq = useRef(0)
  const hasData = useRef(false)

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const ctx = await loadGameContext()
      if (mine !== seq.current) return
      if (!ctx) { router.replace('/auth/login'); return }
      // A closed couple still shows its history; a couple still waiting for
      // the partner has nothing to show yet.
      if (!ctx.coupleId || (!ctx.partner && !ctx.closed)) {
        hasData.current = true
        setState({ status: 'no-partner', ctx })
        return
      }
      const list = await listRounds()
      if (mine !== seq.current) return
      hasData.current = true
      setState({ status: 'ready', ctx, list, partnerName: partnerLabel(ctx.partner?.name) })
    } catch (e) {
      if (mine !== seq.current) return
      console.error('[two-truths] load failed', e)
      if (hasData.current) return
      const code = e instanceof TwoTruthsError ? e.code : errorCode({ message: e instanceof Error ? e.message : null })
      setState({ status: 'error', message: errorText(code, 'your partner') })
    }
  }, [router])

  useEffect(() => { void load() }, [load])

  const coupleId = state.status === 'ready' || state.status === 'no-partner' ? state.ctx.coupleId : null
  useCoupleRealtime(coupleId, ['activities'], () => { void load() })

  const retry = useCallback(() => {
    hasData.current = false
    setState({ status: 'loading' })
    void load()
  }, [load])

  return { state, reload: load, retry }
}
