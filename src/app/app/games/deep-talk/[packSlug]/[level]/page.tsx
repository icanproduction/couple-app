'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { X, ChevronRight, ChevronLeft, Trophy, Check, CloudOff, RefreshCw } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import {
  getPackBySlug,
  getLevelsForPack,
  getQuestionsForLevel,
  getProgress,
  saveProgress,
  markLevelCompleted,
  getLevelStatus,
  isPlayableLevel,
} from '@/lib/deep-talk'
import type { DeepTalkPack, DeepTalkQuestion, DeepTalkLevel } from '@/lib/deep-talk'
import UnlockCelebration from '@/components/app/UnlockCelebration'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface MemberRow {
  profile_id: string
  joined_at: string | null
}

/**
 * "Partner 1" (target_partner = 1) is the member who joined the couple first;
 * ties fall back to the lower profile id. Both phones get the same order.
 */
function orderMembers(rows: MemberRow[]): string[] {
  const time = (r: MemberRow) => {
    const t = r.joined_at ? Date.parse(r.joined_at) : NaN
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
  }
  return [...rows]
    .sort((a, b) => {
      const ta = time(a)
      const tb = time(b)
      if (ta < tb) return -1
      if (ta > tb) return 1
      return a.profile_id < b.profile_id ? -1 : a.profile_id > b.profile_id ? 1 : 0
    })
    .map((r) => r.profile_id)
}

/** target_partner wins when set; otherwise questions alternate 1, 2, 1, 2… */
function getAssignee(question: DeepTalkQuestion, index: number): 1 | 2 {
  if (question.target_partner === 1 || question.target_partner === 2) return question.target_partner
  return index % 2 === 0 ? 1 : 2
}

export default function DeepTalkPlayPage() {
  const router = useRouter()
  const { packSlug, level } = useParams<{ packSlug: string; level: string }>()
  const levelNumber = parseInt(level, 10)
  const packHref = `/app/games/deep-talk/${packSlug}`

  const [pack, setPack] = useState<DeepTalkPack | null>(null)
  const [questions, setQuestions] = useState<DeepTalkQuestion[]>([])
  const [myUserId, setMyUserId] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [packId, setPackId] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [isReplay, setIsReplay] = useState(false)
  const [completedBefore, setCompletedBefore] = useState<number[]>([])
  const [allLevels, setAllLevels] = useState<DeepTalkLevel[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [readIndexes, setReadIndexes] = useState<number[]>([])
  const [isCompleted, setIsCompleted] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [nextLevel, setNextLevel] = useState<DeepTalkLevel | null>(null)

  const packIsFree = pack?.is_free === true

  const mountedRef = useRef(true)
  const completingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) {
      setLoading(false)
      router.replace('/auth/login')
      return
    }
    setMyUserId(user.id)

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) { setLoading(false); return }
    const cid = membership.couple_id
    setCoupleId(cid)

    const [{ data: members }, { data: premium }, p] = await Promise.all([
      supabase.from('couple_members').select('profile_id, joined_at').eq('couple_id', cid),
      supabase.rpc('my_couple_is_premium'),
      getPackBySlug(packSlug),
    ])

    const ordered = orderMembers(members ?? [])
    setMemberIds(ordered)
    if (ordered.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ordered)
      setNames(Object.fromEntries((profiles ?? []).filter((pr) => pr.name).map((pr) => [pr.id, pr.name as string])))
    }

    const premiumNow = premium === true
    setIsPremium(premiumNow)

    if (!p) { setLoading(false); return }
    setPack(p)
    setPackId(p.id)

    const [levels, prog] = await Promise.all([getLevelsForPack(p.id), getProgress(cid, p.id)])
    setAllLevels(levels)
    const targetLevel = levels.find(l => l.level_number === levelNumber)
    if (!targetLevel) { setLoading(false); return }

    // URL guard: cek status level (completed_levels + premium tier)
    const completed = prog?.completed_levels ?? []
    setCompletedBefore(completed)
    const status = getLevelStatus(targetLevel, completed, premiumNow, levels, p.is_free)
    if (status === 'locked') {
      router.replace(`${packHref}?locked=${levelNumber}`)
      return
    }
    if (status === 'premium_locked') {
      router.replace(`${packHref}?premium=${levelNumber}`)
      return
    }
    if (status === 'coming_soon') {
      router.replace(`${packHref}?coming_soon=${levelNumber}`)
      return
    }

    const qs = await getQuestionsForLevel(targetLevel.id)
    setQuestions(qs)

    // Replaying a finished level never touches the shared resume point, so the
    // level still in progress keeps its place (F45). Only an in-range index
    // of this same level is restored (F36).
    const replay = status === 'completed'
    setIsReplay(replay)
    if (
      !replay && prog && prog.level_number === levelNumber &&
      prog.current_question_index > 0 && prog.current_question_index < qs.length
    ) {
      setCurrentIndex(prog.current_question_index)
    }

    setLoading(false)
  }, [packSlug, levelNumber, packHref, router])

  useEffect(() => {
    loadData().catch((err) => {
      console.error('[deep-talk] failed to load the level:', err)
      setLoadError(true)
      setLoading(false)
    })
  }, [loadData])

  // Save the resume point while moving through an unfinished level.
  useEffect(() => {
    if (loading || isReplay || isCompleted || !coupleId || !packId || questions.length === 0) return
    saveProgress(coupleId, packId, levelNumber, Math.min(currentIndex, questions.length - 1))
      .catch((err) => console.error('[deep-talk] failed to save the position:', err))
  }, [loading, isReplay, isCompleted, coupleId, packId, levelNumber, currentIndex, questions.length])

  const completeLevel = useCallback(async () => {
    if (!packId || completingRef.current) return
    completingRef.current = true
    setSaveState('saving')
    try {
      const { firstTime } = await markLevelCompleted(packId, levelNumber)
      if (!mountedRef.current) return
      setSaveState('saved')

      // Celebrate only a level that really opened: first completion, and the
      // next playable level is now 'unlocked' for this couple (premium aware).
      // In a free pack every level was open already, so there's nothing to unlock.
      const completedNow = Array.from(new Set([...completedBefore, levelNumber]))
      const next = allLevels.find(l => l.level_number > levelNumber && isPlayableLevel(l))
      if (!packIsFree && firstTime && next && getLevelStatus(next, completedNow, isPremium, allLevels) === 'unlocked') {
        setNextLevel(next)
        setShowCelebration(true)
      }
    } catch (err) {
      console.error('[deep-talk] failed to save the finished level:', err)
      if (mountedRef.current) setSaveState('error')
    } finally {
      completingRef.current = false
    }
  }, [packId, levelNumber, completedBefore, allLevels, isPremium, packIsFree])

  const dismissCelebration = useCallback(() => setShowCelebration(false), [])

  function goNext() {
    if (questions.length === 0) return
    if (currentIndex >= questions.length - 1) {
      setIsCompleted(true)
      void completeLevel()
      return
    }
    setCurrentIndex(i => Math.min(i + 1, questions.length - 1))
  }

  function goPrev() {
    setCurrentIndex(i => Math.max(i - 1, 0))
  }

  function toggleRead(index: number) {
    setReadIndexes(prev => (prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]))
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    )
  }

  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0))
  const question = questions[safeIndex]

  if (loadError || !pack || !question) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-sm text-ink-muted">
          {loadError ? "Couldn't load the questions. Check your connection and try again." : "We couldn't find these questions"}
        </p>
        <button onClick={() => router.push(packHref)} className="mt-4 text-sm text-rose">Back</button>
      </div>
    )
  }

  const color = pack.color ?? '#E07A9E'

  // Completion screen
  if (isCompleted) {
    const saved = saveState === 'saved'
    const failed = saveState === 'error'
    const hasNextLevel = allLevels.some(l => l.level_number > levelNumber && isPlayableLevel(l))
    const questionCount = `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`
    return (
      <>
        {showCelebration && nextLevel && (
          <UnlockCelebration
            levelNumber={nextLevel.level_number}
            levelTitle={nextLevel.title}
            questionCount={nextLevel.question_count ?? 0}
            onDismiss={dismissCelebration}
          />
        )}
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-white text-center"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
        >
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            {failed
              ? <CloudOff className="h-12 w-12 text-white" strokeWidth={1.5} />
              : <Trophy className="h-12 w-12 text-white" strokeWidth={1.5} />}
          </div>
          <h1 className="text-3xl font-extrabold">
            {failed ? "Progress wasn't saved" : `Level ${levelNumber} done!`}
          </h1>
          <p className="mt-3 text-base text-white/80">
            {failed
              ? `You talked through ${questionCount}, but your progress didn't save. Check your connection and try again.`
              : `You just went through ${questionCount} together.`}
          </p>
          <div className="mt-8 w-full space-y-3">
            {failed ? (
              <button
                onClick={() => { void completeLevel() }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sm font-bold shadow-elevated transition-all active:scale-[0.98]"
                style={{ color }}
              >
                <RefreshCw className="h-4 w-4" /> Try saving again
              </button>
            ) : (
              <button
                onClick={() => router.push(packHref)}
                disabled={!saved}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sm font-bold shadow-elevated transition-all active:scale-[0.98] disabled:opacity-70"
                style={{ color }}
              >
                {!saved && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                {hasNextLevel ? 'See the next level' : 'See all levels'}
              </button>
            )}
            <button
              onClick={() => router.push('/app/games/deep-talk')}
              className="w-full rounded-2xl border border-white/30 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            >
              Back to Deep Talk
            </button>
          </div>
          {saveState === 'saving' && <p className="mt-4 text-xs text-white/60 animate-pulse">Saving progress...</p>}
        </div>
      </>
    )
  }

  const assigneeId = memberIds[getAssignee(question, safeIndex) - 1] ?? null
  const assignedName = assigneeId
    ? names[assigneeId] ?? (assigneeId === myUserId ? 'you' : 'your partner')
    : 'your partner'
  const isRead = readIndexes.includes(safeIndex)
  const progress = ((safeIndex + 1) / questions.length) * 100

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: `linear-gradient(160deg, ${color}15, white 60%)` }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-safe pt-6 pb-2">
        <button
          onClick={() => router.push(packHref)}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur-sm"
        >
          <X className="h-4 w-4 text-ink" />
        </button>

        <div className="flex-1 mx-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: color }}
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-ink-muted">
          {safeIndex + 1}/{questions.length}
        </span>
      </div>

      {/* Card area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* For whom label */}
        <div
          className="mb-5 rounded-full px-5 py-1.5 text-sm font-bold text-white shadow-sm"
          style={{ background: color }}
        >
          Question for {assignedName}
        </div>

        {/* Question card */}
        <button
          onClick={() => toggleRead(safeIndex)}
          aria-pressed={isRead}
          className="relative w-full cursor-pointer rounded-3xl bg-white p-8 shadow-elevated text-center transition-all active:scale-[0.98]"
          style={{
            minHeight: '220px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: isRead ? `2px solid ${color}` : undefined,
          }}
        >
          {isRead && (
            <span
              className="absolute right-4 top-4 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white animate-scale-in"
              style={{ background: color }}
            >
              <Check className="h-3 w-3" strokeWidth={3} /> Done
            </span>
          )}
          <p className={`text-xl font-bold leading-relaxed transition-colors ${isRead ? 'text-ink-muted' : 'text-ink'}`}>
            {question.question_text}
          </p>
        </button>

        <p className="mt-4 text-xs text-ink-muted">
          {isRead ? 'Marked as done. Tap again to undo.' : "Tap the card once you've talked it through"}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 pb-safe pb-8 pt-4">
        <button
          onClick={goPrev}
          disabled={safeIndex === 0}
          aria-label="Previous question"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-white shadow-card disabled:opacity-30 transition-all active:scale-[0.95]"
        >
          <ChevronLeft className="h-5 w-5 text-ink" />
        </button>

        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === safeIndex ? 'w-5' : 'w-1.5'
              }`}
              style={{
                background: i <= safeIndex ? color : '#e5e7eb',
              }}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          aria-label={safeIndex >= questions.length - 1 ? 'Finish level' : 'Next question'}
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-elevated transition-all active:scale-[0.95]"
          style={{ background: color }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
