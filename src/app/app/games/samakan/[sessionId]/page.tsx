'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, DoorOpen } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { getChapter } from '@/data/samakan'
import {
  getGameSession,
  useGameChannel,
  updateSessionPlaying,
  saveSessionRounds,
  completeGameSession,
  expireGameSession,
  getScoreForRound,
  normalizeResults,
  sumScores,
} from '@/lib/samakan'
import type {
  GamePhase,
  PlayerRole,
  RoundResult,
  BroadcastPayload,
  Chapter,
} from '@/types/samakan'

import StoryCard from '@/components/game/StoryCard'
import SinkronisasiLobby from '@/components/game/SinkronisasiLobby'
import SinkronisasiCountdown from '@/components/game/SinkronisasiCountdown'
import SinkronisasiScoreBar from '@/components/game/SinkronisasiScoreBar'
import RoundPilihSama from '@/components/game/RoundPilihSama'
import RoundSliderSama from '@/components/game/RoundSliderSama'
import RoundTebakAngka from '@/components/game/RoundTebakAngka'
import RoundTebakPasangan from '@/components/game/RoundTebakPasangan'
import SinkronisasiReveal from '@/components/game/SinkronisasiReveal'
import SinkronisasiResults from '@/components/game/SinkronisasiResults'
import {
  GameCloseButton,
  ConfirmExitSheet,
  PartnerAwayOverlay,
  PartnerAwayBanner,
} from '@/components/game/GameExitControls'

/** An answer is always tagged with the round it belongs to. */
interface Answer {
  round: number
  value: unknown
}

type SyncPayload = Extract<BroadcastPayload, { type: 'sync_state' }>
type EndedReason = 'expired' | 'partner' | 'error'

const REVEAL_MS = 3500
const PARTNER_AWAY_GRACE_MS = 4000
const HUB = '/app/games/samakan'

/** Phases where a missing partner blocks the game (after game_complete it does not). */
const PARTNER_NEEDED: GamePhase[] = ['countdown', 'story_intro', 'challenge', 'reveal', 'story_bridge', 'waiting_partner']
/** Phases without a score bar, which get the floating close button. */
const FLOATING_CLOSE: GamePhase[] = ['connecting', 'countdown', 'story_intro', 'story_bridge', 'story_ending', 'reveal', 'waiting_partner']
const MUSIC_PHASES: GamePhase[] = ['countdown', 'story_intro', 'challenge', 'reveal', 'story_bridge', 'story_ending']
/** Closing in these phases ends the session for both players. */
const LIVE_PHASES: GamePhase[] = ['lobby', ...PARTNER_NEEDED]

/** Position on the game timeline: host events are applied only when the guest is behind. */
function timelinePos(phase: GamePhase, round: number): number {
  switch (phase) {
    case 'lobby': return 0
    case 'countdown': return 1
    case 'story_intro': return 2
    case 'story_bridge': return 10 + round * 10
    case 'challenge': return 10 + round * 10 + 1
    case 'reveal': return 10 + round * 10 + 2
    case 'story_ending': return 1_000_000
    case 'results': return 1_000_001
    case 'ended': return 2_000_000
    default: return -1 // connecting, waiting_partner
  }
}

const isPostGame = (p: GamePhase) => p === 'story_ending' || p === 'results'

export default function SinkronisasiGamePage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  // Core state
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [userId, setUserId] = useState('')
  const [channelUserId, setChannelUserId] = useState('') // set once init decided realtime is needed
  const [role, setRole] = useState<PlayerRole>('guest')
  const [myName, setMyName] = useState('')
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('Pasangan')
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null)
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null)

  // Game state
  const [phase, setPhase] = useState<GamePhase>('connecting')
  const [currentRound, setCurrentRound] = useState(0)
  const [roundResults, setRoundResults] = useState<RoundResult[]>([])
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)
  const [partnerAnswer, setPartnerAnswer] = useState<Answer | null>(null) // host only
  const [roundKey, setRoundKey] = useState(0) // remounts round inputs after a resync
  const [endedReason, setEndedReason] = useState<EndedReason>('expired')
  const [isMyReady, setIsMyReady] = useState(false)

  // UI state
  const [confirmExit, setConfirmExit] = useState(false)
  const [partnerAway, setPartnerAway] = useState(false)
  const [awayDismissed, setAwayDismissed] = useState(false)
  const [muted, setMuted] = useState(false)

  const totalScore = useMemo(() => sumScores(roundResults), [roundResults])

  // Refs mirror the state the realtime callbacks need. They are written at the
  // same moment the state is set (apply* helpers), never during render.
  const phaseRef = useRef<GamePhase>('connecting')
  const roundRef = useRef(0)
  const resultsRef = useRef<RoundResult[]>([])
  const myAnswerRef = useRef<Answer | null>(null)
  const roleRef = useRef<PlayerRole>('guest')
  const chapterRef = useRef<Chapter | null>(null)
  const userIdRef = useRef('')
  const scoredRoundRef = useRef(-1) // host: last round already scored
  const startedRef = useRef(false) // host: game_start already sent
  const closingRef = useRef(false)
  const mountedRef = useRef(true)
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { broadcast, onEvent, onPartnerJoin, setReady, isPartnerConnected, isPartnerReady } =
    useGameChannel(sessionId, channelUserId)

  // ─── STATE HELPERS ───
  const applyPhase = useCallback((next: GamePhase, round?: number) => {
    phaseRef.current = next
    setPhase(next)
    if (round !== undefined) {
      roundRef.current = round
      setCurrentRound(round)
    }
  }, [])

  const applyResults = useCallback((results: RoundResult[]) => {
    const normalized = normalizeResults(results)
    resultsRef.current = normalized
    setRoundResults(normalized)
  }, [])

  const applyMyAnswer = useCallback((answer: Answer | null) => {
    myAnswerRef.current = answer
    setMyAnswer(answer)
  }, [])

  /** setTimeout that is cleared when the page unmounts. */
  const schedule = useCallback((fn: () => void, ms: number) => {
    const timers = timersRef.current
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }, [])

  // ─── MOUNT / UNMOUNT ───
  useEffect(() => {
    mountedRef.current = true
    const timers = timersRef.current
    return () => {
      mountedRef.current = false
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  // ─── AUDIO ───
  const stopAudio = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  useEffect(() => {
    if (MUSIC_PHASES.includes(phase)) {
      if (!audioRef.current) {
        const audio = new Audio('/audio/samakan-bgm.m4a')
        audio.loop = true
        audio.volume = 0.3
        audio.play().catch(() => {}) // ignore autoplay block
        audioRef.current = audio
      }
      audioRef.current.muted = muted
    } else {
      stopAudio()
    }
  }, [phase, muted, stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  // ─── INIT ───
  useEffect(() => {
    let cancelled = false

    async function init() {
      const supabase = createClient()
      const user = await getClientUser()
      if (cancelled) return
      if (!user) { router.replace('/auth/login'); return }
      userIdRef.current = user.id
      setUserId(user.id)

      const [{ data: profile }, sess] = await Promise.all([
        supabase.from('profiles').select('name, avatar_url').eq('id', user.id).maybeSingle(),
        getGameSession(sessionId),
      ])
      if (cancelled) return
      setMyName(profile?.name ?? 'Kamu')
      setMyAvatar(profile?.avatar_url ?? null)
      if (!sess) { router.replace(HUB); return }

      const ch = getChapter(sess.chapter_id)
      if (!ch) { router.replace(HUB); return }
      const isHost = sess.created_by === user.id
      roleRef.current = isHost ? 'host' : 'guest'
      setRole(roleRef.current)
      chapterRef.current = ch
      setChapter(ch)

      const partnerId = isHost ? sess.partner_id : sess.created_by
      setPartnerUserId(partnerId ?? null)
      if (partnerId) {
        const { data: partnerProfile } = await supabase.from('profiles').select('name, avatar_url').eq('id', partnerId).maybeSingle()
        if (cancelled) return
        setPartnerName(partnerProfile?.name ?? 'Pasangan')
        setPartnerAvatar(partnerProfile?.avatar_url ?? null)
      }

      const saved = normalizeResults((sess.rounds ?? []) as RoundResult[])

      if (sess.status === 'completed') {
        applyResults(saved)
        applyPhase('results', Math.max(saved.length - 1, 0))
        return // finished: no realtime needed
      }
      if (sess.status === 'expired') {
        setEndedReason('expired')
        applyPhase('ended')
        return // never flip an ended session back to playing
      }

      if (sess.status === 'playing') {
        startedRef.current = true
        if (isHost) {
          // Host refresh: rebuild from the rounds persisted after each reveal.
          applyResults(saved)
          scoredRoundRef.current = saved.length - 1
          if (saved.length >= ch.rounds.length) {
            applyPhase('story_ending', ch.rounds.length - 1)
            void completeGameSession(sessionId, sumScores(saved), resultsRef.current)
          } else if (saved.length === 0) {
            applyPhase('story_intro', 0)
          } else {
            applyPhase('story_bridge', saved.length)
          }
        } else {
          // Guest refresh / late join: wait for the host's sync_state.
          applyPhase('waiting_partner')
        }
      } else {
        applyPhase('lobby')
      }

      setChannelUserId(user.id)
    }

    init().catch((err) => {
      console.error('[samakan] gagal memuat sesi:', err)
      if (cancelled) return
      setEndedReason('error')
      applyPhase('ended')
    })
    return () => { cancelled = true }
  }, [sessionId, router, applyPhase, applyResults])

  // ─── SYNC (host → guest) ───
  const sendSnapshot = useCallback(() => {
    if (roleRef.current !== 'host') return
    const p = phaseRef.current
    if (p === 'connecting' || p === 'ended') return
    broadcast({
      type: 'sync_state',
      phase: p,
      currentRound: roundRef.current,
      results: resultsRef.current,
      totalScore: sumScores(resultsRef.current),
    })
  }, [broadcast])

  /** Guest: re-send an answer the host may have missed while we were away. */
  const resendMyAnswer = useCallback(() => {
    const answer = myAnswerRef.current
    if (phaseRef.current !== 'challenge' || !answer || answer.round !== roundRef.current) return
    broadcast({ type: 'player_answer', playerId: userIdRef.current, roundIndex: answer.round, answer: answer.value })
  }, [broadcast])

  const applySnapshot = useCallback((s: SyncPayload) => {
    const local = phaseRef.current
    if (local === 'ended') return
    const results = normalizeResults(s.results ?? [])
    const samePlace =
      (local === s.phase || (isPostGame(local) && isPostGame(s.phase))) &&
      roundRef.current === s.currentRound &&
      resultsRef.current.length === results.length
    if (samePlace) {
      resendMyAnswer()
      return
    }
    applyResults(results)
    applyMyAnswer(null)
    setRoundKey((k) => k + 1)
    applyPhase(s.phase, s.currentRound)
  }, [applyPhase, applyResults, applyMyAnswer, resendMyAnswer])

  // Guest reopened a running game: ask the host until a sync_state arrives.
  useEffect(() => {
    if (role !== 'guest' || phase !== 'waiting_partner' || !isPartnerConnected) return
    const ask = () => broadcast({ type: 'request_sync', playerId: userIdRef.current })
    ask()
    const id = setInterval(ask, 3000)
    return () => clearInterval(id)
  }, [role, phase, isPartnerConnected, broadcast])

  // Partner (re)joined presence: host sends a snapshot, guest re-sends its answer.
  useEffect(() => {
    onPartnerJoin(() => {
      if (roleRef.current === 'host') sendSnapshot()
      else resendMyAnswer()
    })
  }, [onPartnerJoin, sendSnapshot, resendMyAnswer])

  // ─── HOST: both ready → start game ───
  useEffect(() => {
    if (role !== 'host' || phase !== 'lobby' || !chapter || startedRef.current) return
    if (!isMyReady || !isPartnerReady || !isPartnerConnected) return
    startedRef.current = true
    void (async () => {
      // Unknown status (network hiccup) still starts the game; only a session
      // that already ended elsewhere is refused.
      const status = await updateSessionPlaying(sessionId).catch(() => null)
      if (!mountedRef.current || phaseRef.current !== 'lobby') return
      if (status === 'expired' || status === 'completed') {
        broadcast({ type: 'session_ended', playerId: userIdRef.current })
        setEndedReason('expired')
        applyPhase('ended')
        return
      }
      applyPhase('countdown', 0)
      broadcast({ type: 'game_start', rounds: chapter.rounds, startAt: Date.now() + 4000 })
    })()
  }, [role, phase, chapter, isMyReady, isPartnerReady, isPartnerConnected, sessionId, broadcast, applyPhase])

  // ─── HOST: after the reveal, move to the next round or the ending ───
  const advanceAfterReveal = useCallback((round: number, results: RoundResult[], total: number) => {
    const ch = chapterRef.current
    if (!ch || phaseRef.current !== 'reveal' || roundRef.current !== round) return
    const next = round + 1
    if (next >= ch.rounds.length) {
      applyPhase('story_ending')
      broadcast({ type: 'game_complete', totalScore: total, results })
      void completeGameSession(sessionId, total, results)
    } else {
      applyPhase('story_bridge', next)
      broadcast({ type: 'round_start', roundIndex: next })
    }
  }, [applyPhase, broadcast, sessionId])

  // ─── HOST: score once both answers for this round are in ───
  // Runs after both answers are committed, so two simultaneous answers can
  // never skip scoring; scoredRoundRef makes it once per round.
  useEffect(() => {
    if (role !== 'host' || phase !== 'challenge' || !chapter) return
    if (!myAnswer || !partnerAnswer) return
    if (myAnswer.round !== currentRound || partnerAnswer.round !== currentRound) return
    if (scoredRoundRef.current >= currentRound) return
    const config = chapter.rounds[currentRound]
    if (!config) return
    scoredRoundRef.current = currentRound

    const score = getScoreForRound(config.type, myAnswer.value, partnerAnswer.value)
    const result: RoundResult = {
      type: config.type,
      roundIndex: currentRound,
      config,
      hostAnswer: myAnswer.value,
      guestAnswer: partnerAnswer.value,
      score,
    }
    const newResults = normalizeResults([...roundResults, result])
    const newTotal = sumScores(newResults)
    applyResults(newResults)
    applyPhase('reveal', currentRound)
    broadcast({ type: 'round_reveal', roundIndex: currentRound, result, totalScore: newTotal })
    void saveSessionRounds(sessionId, newResults, newTotal)

    const round = currentRound
    schedule(() => advanceAfterReveal(round, newResults, newTotal), REVEAL_MS)
  }, [role, phase, chapter, myAnswer, partnerAnswer, currentRound, roundResults, sessionId,
    applyResults, applyPhase, broadcast, schedule, advanceAfterReveal])

  // ─── BROADCAST EVENT HANDLER ───
  const handleEvent = useCallback((payload: BroadcastPayload) => {
    const isHost = roleRef.current === 'host'
    const here = timelinePos(phaseRef.current, roundRef.current)

    // A guest that reopened a running game only trusts the host's snapshot:
    // a lone round event would leave it with partial results.
    if (!isHost && phaseRef.current === 'waiting_partner' &&
      (payload.type === 'round_start' || payload.type === 'round_reveal' || payload.type === 'story_next')) {
      return
    }

    switch (payload.type) {
      case 'game_start':
        if (!isHost && here < timelinePos('countdown', 0)) applyPhase('countdown', 0)
        break
      case 'round_start':
        if (!isHost && here < timelinePos('story_bridge', payload.roundIndex)) {
          applyPhase('story_bridge', payload.roundIndex)
        }
        break
      case 'player_answer':
        // Only answers for the round being played (or a later one) count.
        if (isHost && payload.roundIndex >= roundRef.current) {
          setPartnerAnswer({ round: payload.roundIndex, value: payload.answer })
        }
        break
      case 'round_reveal':
        if (!isHost) {
          applyResults([...resultsRef.current, payload.result])
          if (here < timelinePos('reveal', payload.roundIndex)) applyPhase('reveal', payload.roundIndex)
        }
        break
      case 'game_complete':
        if (!isHost) {
          applyResults(payload.results)
          if (!isPostGame(phaseRef.current)) applyPhase('story_ending')
        }
        break
      case 'story_next':
        if (!isHost && here < timelinePos(payload.phase, payload.round)) {
          applyPhase(payload.phase, payload.round)
        }
        break
      case 'sync_state':
        if (!isHost) applySnapshot(payload)
        break
      case 'request_sync':
        if (isHost) sendSnapshot()
        break
      case 'session_ended':
        if (!isPostGame(phaseRef.current) && phaseRef.current !== 'ended') {
          setEndedReason('partner')
          applyPhase('ended')
        }
        break
    }
  }, [applyPhase, applyResults, applySnapshot, sendSnapshot])

  useEffect(() => { onEvent(handleEvent) }, [onEvent, handleEvent])

  // ─── PARTNER AWAY ───
  const partnerNeeded = PARTNER_NEEDED.includes(phase)
  useEffect(() => {
    if (!partnerNeeded || isPartnerConnected) {
      setPartnerAway(false)
      setAwayDismissed(false)
      return
    }
    const t = setTimeout(() => setPartnerAway(true), PARTNER_AWAY_GRACE_MS)
    return () => clearTimeout(t)
  }, [partnerNeeded, isPartnerConnected])

  // ─── PLAYER ACTIONS ───
  const handleMyAnswer = useCallback((value: unknown) => {
    if (phaseRef.current !== 'challenge') return
    const round = roundRef.current
    if (myAnswerRef.current?.round === round) return // already answered this round
    applyMyAnswer({ round, value })
    broadcast({ type: 'player_answer', playerId: userIdRef.current, roundIndex: round, answer: value })
  }, [applyMyAnswer, broadcast])

  const handleReady = useCallback(() => {
    setIsMyReady(true)
    setReady(true)
  }, [setReady])

  const handleCountdownDone = useCallback(() => {
    if (phaseRef.current === 'countdown') applyPhase('story_intro', 0)
  }, [applyPhase])

  // Intro/bridge cards are host-paced; the ending card is local for both.
  const handleStoryNext = useCallback(() => {
    const p = phaseRef.current
    if (p === 'story_ending') {
      applyPhase('results')
      return
    }
    if (roleRef.current !== 'host') return
    if (p === 'story_intro' || p === 'story_bridge') {
      const round = roundRef.current
      applyPhase('challenge', round)
      broadcast({ type: 'story_next', phase: 'challenge', round })
    }
  }, [applyPhase, broadcast])

  /** Leave the page; while the game is live this ends it for both players. */
  const leaveGame = useCallback(async () => {
    if (closingRef.current) return
    closingRef.current = true
    if (LIVE_PHASES.includes(phaseRef.current)) {
      broadcast({ type: 'session_ended', playerId: userIdRef.current })
      await expireGameSession(sessionId)
    }
    router.push(HUB)
  }, [broadcast, sessionId, router])

  const handleClose = useCallback(() => {
    const p = phaseRef.current
    if (p === 'lobby' || !LIVE_PHASES.includes(p)) {
      void leaveGame()
      return
    }
    setConfirmExit(true)
  }, [leaveGame])

  const toggleMute = useCallback(() => setMuted((m) => !m), [])

  // ─── RENDER ───
  let screen: ReactNode

  if (phase === 'ended') {
    const copy = endedReason === 'partner'
      ? { title: `${partnerName} mengakhiri permainan`, desc: 'Kalian bisa mulai lagi kapan saja dari halaman Sinkronisasi.' }
      : endedReason === 'error'
        ? { title: 'Permainan gagal dimuat', desc: 'Cek koneksi internetmu, lalu coba buka lagi.' }
        : { title: 'Sesi ini sudah berakhir', desc: 'Mulai permainan baru dari halaman Sinkronisasi ya.' }
    screen = (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-ink to-gray-900 px-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <DoorOpen className="h-8 w-8 text-white/70" />
        </div>
        <h2 className="text-xl font-bold text-white">{copy.title}</h2>
        <p className="mt-2 max-w-xs text-sm text-white/60">{copy.desc}</p>
        <button
          onClick={() => router.push(HUB)}
          className="mt-8 rounded-full bg-rose px-8 py-3 text-sm font-bold text-white shadow-lg shadow-rose/30 active:scale-95 transition-transform"
        >
          Kembali ke Sinkronisasi
        </button>
      </div>
    )
  } else if (phase === 'connecting' || !chapter) {
    screen = (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-ink to-gray-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          <p className="text-sm text-white/40">Menghubungkan...</p>
        </div>
      </div>
    )
  } else if (phase === 'lobby') {
    screen = (
      <SinkronisasiLobby
        myName={myName} myAvatar={myAvatar} partnerName={partnerName} partnerAvatar={partnerAvatar}
        isPartnerConnected={isPartnerConnected} isMyReady={isMyReady} isPartnerReady={isPartnerReady}
        sessionId={sessionId} partnerId={partnerUserId} chapterTitle={chapter.title}
        onReady={handleReady} onClose={handleClose}
      />
    )
  } else if (phase === 'waiting_partner') {
    screen = (
      <div className={`fixed inset-0 z-50 flex items-center justify-center ${chapter.bgClass}`}>
        <div className="flex flex-col items-center gap-3 px-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          <p className="text-sm text-white/60">
            {isPartnerConnected ? 'Menyambungkan ulang permainan...' : `Menunggu ${partnerName} kembali ke permainan...`}
          </p>
        </div>
      </div>
    )
  } else if (phase === 'countdown') {
    screen = <SinkronisasiCountdown onComplete={handleCountdownDone} />
  } else if (phase === 'story_intro' || phase === 'story_bridge' || phase === 'story_ending') {
    let text: string
    if (phase === 'story_intro') {
      text = chapter.intro
    } else if (phase === 'story_bridge') {
      text = chapter.bridges[currentRound - 1] ?? chapter.bridges[chapter.bridges.length - 1]
    } else {
      const maxScore = chapter.rounds.length * 20
      const pct = maxScore > 0 ? (totalScore / maxScore) * 100 : 0
      text = pct >= 80 ? chapter.endings.high : pct >= 50 ? chapter.endings.mid : chapter.endings.low
    }
    const hint = role === 'guest' && phase !== 'story_ending' ? `Menunggu ${partnerName} lanjut...` : undefined
    screen = <StoryCard text={text} gradient={chapter.bgClass} onNext={handleStoryNext} hint={hint} />
  } else if (phase === 'results') {
    const maxScore = chapter.rounds.length * 20
    const pct = maxScore > 0 ? (totalScore / maxScore) * 100 : 0
    const endingText = pct >= 80 ? chapter.endings.high : pct >= 50 ? chapter.endings.mid : chapter.endings.low
    screen = (
      <SinkronisasiResults
        totalScore={totalScore} results={roundResults} ending={endingText}
        chapterTitle={chapter.title}
        onPlayAgain={() => router.push(HUB)}
        onBack={() => router.push('/app/games')}
      />
    )
  } else {
    const revealResult = phase === 'reveal'
      ? roundResults.find((r) => r.roundIndex === currentRound) ?? null
      : null
    const config = phase === 'challenge' ? chapter.rounds[currentRound] : undefined
    const answered = myAnswer?.round === currentRound
    const inputKey = `${currentRound}-${roundKey}`

    if (revealResult) {
      screen = (
        <SinkronisasiReveal
          key={`reveal-${revealResult.roundIndex}`}
          result={revealResult}
          hostName={role === 'host' ? myName : partnerName}
          guestName={role === 'host' ? partnerName : myName}
        />
      )
    } else if (config) {
      screen = (
        <div className={`fixed inset-0 z-50 ${chapter.bgClass}`}>
          <SinkronisasiScoreBar
            currentRound={currentRound} totalRounds={chapter.rounds.length}
            totalScore={totalScore} onClose={handleClose}
            muted={muted} onToggleMute={toggleMute}
          />

          {config.type === 'pilih_sama' && (
            <RoundPilihSama key={inputKey} config={config} onSubmit={handleMyAnswer} disabled={answered} />
          )}
          {config.type === 'slider_sama' && (
            <RoundSliderSama key={inputKey} config={config} onSubmit={handleMyAnswer} disabled={answered} />
          )}
          {config.type === 'tebak_angka' && (
            <RoundTebakAngka key={inputKey} config={config} onSubmit={handleMyAnswer} disabled={answered} />
          )}
          {config.type === 'tebak_pasangan' && (
            <RoundTebakPasangan key={inputKey} config={config} role={role} onSubmit={handleMyAnswer} />
          )}
        </div>
      )
    } else {
      // Fallback
      screen = (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${chapter.bgClass}`}>
          <SinkronisasiScoreBar
            currentRound={currentRound} totalRounds={chapter.rounds.length}
            totalScore={totalScore} onClose={handleClose}
            muted={muted} onToggleMute={toggleMute}
          />
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <p className="text-sm text-white/40">Menunggu pasangan...</p>
          </div>
        </div>
      )
    }
  }

  const showFloatingClose = FLOATING_CLOSE.includes(phase) && !(phase === 'reveal' && !roundResults.some((r) => r.roundIndex === currentRound))

  return (
    <>
      {screen}
      {showFloatingClose && <GameCloseButton onClick={handleClose} />}
      {partnerAway && !awayDismissed && (
        <PartnerAwayOverlay
          partnerName={partnerName}
          onWait={() => setAwayDismissed(true)}
          onEnd={() => { void leaveGame() }}
        />
      )}
      {partnerAway && awayDismissed && (
        <PartnerAwayBanner partnerName={partnerName} onClick={() => setAwayDismissed(false)} />
      )}
      {confirmExit && (
        <ConfirmExitSheet
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => { setConfirmExit(false); void leaveGame() }}
        />
      )}
    </>
  )
}
