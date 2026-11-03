'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { RoundResult, RoundType, BroadcastPayload, GameSession, GamePresence, GameStatus } from '@/types/samakan'
import type { Json } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── SCORING ───

export function scorePilihSama(a: string, b: string): number {
  return a === b ? 20 : 0
}

/** Gradient scoring for slider-based rounds: closer = higher score */
export function scoreSliderDiff(a: number, b: number): number {
  const diff = Math.abs(a - b)
  if (diff === 0) return 20
  if (diff === 1) return 17
  if (diff === 2) return 14
  if (diff === 3) return 10
  if (diff === 4) return 7
  if (diff === 5) return 5
  return 3 // diff 6-9: still get points, never zero
}

export function scoreTebakPasangan(
  aReal: string, aGuess: string, bReal: string, bGuess: string
): number {
  const match1 = aReal === bGuess ? 1 : 0
  const match2 = bReal === aGuess ? 1 : 0
  if (match1 + match2 === 2) return 20
  if (match1 + match2 === 1) return 10
  return 0
}

export function getScoreForRound(type: RoundType, hostAnswer: unknown, guestAnswer: unknown): number {
  switch (type) {
    case 'pilih_sama': return scorePilihSama(hostAnswer as string, guestAnswer as string)
    case 'slider_sama': return scoreSliderDiff(hostAnswer as number, guestAnswer as number)
    case 'tebak_angka': return scoreSliderDiff(hostAnswer as number, guestAnswer as number)
    case 'tebak_pasangan': {
      const h = hostAnswer as { real: string; guess: string }
      const g = guestAnswer as { real: string; guess: string }
      return scoreTebakPasangan(h.real, h.guess, g.real, g.guess)
    }
    default: return 0
  }
}

export type RoundTone = 'match' | 'close' | 'miss'

/**
 * How a round "felt", decided per round type: slider rounds give partial
 * points (17/14/10/7/5/3), so a raw score threshold mislabels them.
 */
export function getRoundVerdict(result: Pick<RoundResult, 'type' | 'score'>): { tone: RoundTone; label: string } {
  const { type, score } = result
  switch (type) {
    case 'pilih_sama':
      return score >= 20 ? { tone: 'match', label: 'In sync' } : { tone: 'miss', label: 'Not quite...' }
    case 'slider_sama':
    case 'tebak_angka':
      if (score >= 20) return { tone: 'match', label: 'Exact match' }
      if (score >= 14) return { tone: 'match', label: 'In sync' } // gap ≤ 2
      if (score >= 7) return { tone: 'close', label: 'So close' } // gap 3–4
      return { tone: 'miss', label: 'Way off...' }
    case 'tebak_pasangan':
      if (score >= 20) return { tone: 'match', label: 'You know each other well' }
      if (score >= 10) return { tone: 'close', label: 'Half right' }
      return { tone: 'miss', label: 'Missed this one...' }
    default:
      return score >= 15 ? { tone: 'match', label: 'In sync' } : { tone: 'miss', label: 'Not quite...' }
  }
}

export function sumScores(results: RoundResult[]): number {
  return results.reduce((total, r) => total + (r.score ?? 0), 0)
}

/** One result per round, in round order (later entries win). */
export function normalizeResults(results: RoundResult[]): RoundResult[] {
  const byRound = new Map<number, RoundResult>()
  for (const r of results) {
    if (r && typeof r.roundIndex === 'number') byRound.set(r.roundIndex, r)
  }
  return Array.from(byRound.values()).sort((a, b) => a.roundIndex - b.roundIndex)
}

// ─── DB OPERATIONS ───

export async function getGameSession(sessionId: string): Promise<GameSession | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  return data as GameSession | null
}

/**
 * waiting → playing, only from 'waiting' so an expired or completed session
 * is never reopened. Returns the session status after the call.
 */
export async function updateSessionPlaying(sessionId: string): Promise<GameStatus | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from('game_sessions').update({
    status: 'playing',
    started_at: new Date().toISOString(),
  }).eq('id', sessionId).eq('status', 'waiting').select('status')
  if (error) console.error('[samakan] failed to start the session:', error.message)
  if (data && data.length > 0) return 'playing'
  const current = await getGameSession(sessionId)
  return current?.status ?? null
}

/** Persists every scored round so a refreshed host can rebuild the game. */
export async function saveSessionRounds(sessionId: string, results: RoundResult[], totalScore: number) {
  const supabase = createClient()
  const { error } = await supabase.from('game_sessions').update({
    rounds: results as unknown as Json[],
    total_score: totalScore,
  }).eq('id', sessionId).in('status', ['waiting', 'playing'])
  if (error) console.error('[samakan] failed to save the round:', error.message)
}

export async function completeGameSession(sessionId: string, totalScore: number, results: RoundResult[]) {
  const supabase = createClient()
  const { error } = await supabase.from('game_sessions').update({
    status: 'completed',
    total_score: totalScore,
    rounds: results as unknown as Json[],
    completed_at: new Date().toISOString(),
  }).eq('id', sessionId).neq('status', 'completed')
  if (error) console.error('[samakan] failed to complete the session:', error.message)
}

/** Closing the game ends it for both players (frees the couple's open slot). */
export async function expireGameSession(sessionId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('game_sessions')
    .update({ status: 'expired' })
    .eq('id', sessionId)
    .in('status', ['waiting', 'playing'])
  if (error) console.error('[samakan] failed to end the session:', error.message)
}

export async function getGameHistory(coupleId: string, limit = 10): Promise<GameSession[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as GameSession[]
}

// ─── REALTIME HOOK ───

/**
 * Channel `game:<sessionId>`: broadcast for game events, presence for who is
 * here and who is ready. Presence is keyed by user id, so two tabs of the same
 * person never count as "partner connected".
 */
export function useGameChannel(sessionId: string, userId: string) {
  const supabaseRef = useRef(createClient())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribedRef = useRef(false)
  const presenceRef = useRef<GamePresence>({ user_id: userId, ready: false })
  const eventHandlerRef = useRef<((payload: BroadcastPayload) => void) | null>(null)
  const partnerJoinRef = useRef<(() => void) | null>(null)
  const [isPartnerConnected, setIsPartnerConnected] = useState(false)
  const [isPartnerReady, setIsPartnerReady] = useState(false)

  useEffect(() => {
    // Don't connect until we have a real userId
    if (!userId) return

    const supabase = supabaseRef.current
    presenceRef.current = { ...presenceRef.current, user_id: userId }
    const channel = supabase.channel(`game:${sessionId}`, {
      config: { broadcast: { self: false }, presence: { key: userId } },
    })

    const checkPresence = () => {
      const state = channel.presenceState<GamePresence>()
      const partnerMetas = Object.entries(state)
        .filter(([key]) => key !== userId)
        .flatMap(([, metas]) => metas)
      setIsPartnerConnected(partnerMetas.length > 0)
      setIsPartnerReady(partnerMetas.some((m) => m.ready === true))
    }

    channel
      .on('broadcast', { event: 'game_event' }, ({ payload }) => {
        eventHandlerRef.current?.(payload as BroadcastPayload)
      })
      // 'sync' fires after every join/leave once the state is updated
      .on('presence', { event: 'sync' }, checkPresence)
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key !== userId) partnerJoinRef.current?.()
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Also runs after a reconnect: re-announce the latest presence
          subscribedRef.current = true
          await channel.track(presenceRef.current)
          checkPresence()
        } else {
          subscribedRef.current = false
        }
      })

    channelRef.current = channel

    return () => {
      subscribedRef.current = false
      channelRef.current = null
      setIsPartnerConnected(false)
      setIsPartnerReady(false)
      supabase.removeChannel(channel)
    }
  }, [sessionId, userId])

  const broadcast = useCallback((payload: BroadcastPayload) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game_event',
      payload,
    })
  }, [])

  /** Lobby readiness lives in presence, so a reconnect cannot lose it. */
  const setReady = useCallback((ready: boolean) => {
    presenceRef.current = { ...presenceRef.current, ready }
    if (subscribedRef.current) {
      channelRef.current?.track(presenceRef.current)
    }
  }, [])

  const onEvent = useCallback((handler: (payload: BroadcastPayload) => void) => {
    eventHandlerRef.current = handler
  }, [])

  /** Called whenever the partner (re)appears in presence. */
  const onPartnerJoin = useCallback((handler: () => void) => {
    partnerJoinRef.current = handler
  }, [])

  return { broadcast, onEvent, onPartnerJoin, setReady, isPartnerConnected, isPartnerReady }
}
