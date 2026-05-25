'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { X, ChevronRight, ChevronLeft, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  getPackBySlug,
  getLevelsForPack,
  getQuestionsForLevel,
  getProgress,
  saveProgress,
  markLevelCompleted,
  getLevelStatus,
} from '@/lib/deep-talk'
import type { DeepTalkPack, DeepTalkQuestion, DeepTalkLevel } from '@/lib/deep-talk'
import UnlockCelebration from '@/components/app/UnlockCelebration'

export default function DeepTalkPlayPage() {
  const router = useRouter()
  const { packSlug, level } = useParams<{ packSlug: string; level: string }>()
  const levelNumber = parseInt(level, 10)

  const [pack, setPack] = useState<DeepTalkPack | null>(null)
  const [questions, setQuestions] = useState<DeepTalkQuestion[]>([])
  const [myName, setMyName] = useState<string>('Kamu')
  const [partnerName, setPartnerName] = useState<string>('Pasangan')
  const [myUserId, setMyUserId] = useState<string>('')
  const [partnerUserId, setPartnerUserId] = useState<string>('')
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [packId, setPackId] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [nextLevel, setNextLevel] = useState<DeepTalkLevel | null>(null)
  const [allLevels, setAllLevels] = useState<DeepTalkLevel[]>([])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyUserId(user.id)

    // Get my profile
    const { data: myProfile } = await supabase
      .from('profiles').select('name').eq('id', user.id).single()
    if (myProfile?.name) setMyName(myProfile.name)

    // Get couple
    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).single()
    if (!membership?.couple_id) { setLoading(false); return }
    setCoupleId(membership.couple_id)

    // Get partner name
    const { data: partnerMembers } = await supabase
      .from('couple_members').select('profile_id')
      .eq('couple_id', membership.couple_id).neq('profile_id', user.id)
    if (partnerMembers?.[0]) {
      setPartnerUserId(partnerMembers[0].profile_id)
      const { data: pp } = await supabase.from('profiles').select('name').eq('id', partnerMembers[0].profile_id).single()
      if (pp?.name) setPartnerName(pp.name)
    }

    // Load pack
    const p = await getPackBySlug(packSlug)
    if (!p) { setLoading(false); return }
    setPack(p)
    setPackId(p.id)

    // Load level + questions + progress
    const levels = await getLevelsForPack(p.id)
    setAllLevels(levels)
    const targetLevel = levels.find(l => l.level_number === levelNumber)
    if (!targetLevel) { setLoading(false); return }

    // URL guard: cek status level berdasarkan completed_levels
    const prog = await getProgress(membership.couple_id, p.id)
    const status = getLevelStatus(targetLevel, prog?.completed_levels ?? [])
    if (status === 'locked') {
      router.replace(`/app/games/deep-talk/${packSlug}?locked=${levelNumber}`)
      return
    }
    if (status === 'coming_soon') {
      router.replace(`/app/games/deep-talk/${packSlug}?coming_soon=${levelNumber}`)
      return
    }

    const qs = await getQuestionsForLevel(targetLevel.id)
    setQuestions(qs)

    // Restore progress (prog sudah di-fetch di URL guard di atas)
    if (prog && prog.level_number === levelNumber && !prog.is_completed) {
      setCurrentIndex(prog.current_question_index)
    }

    setLoading(false)
  }, [packSlug, levelNumber])

  useEffect(() => { loadData() }, [loadData])

  // Save in-progress (saat user scroll antar pertanyaan)
  useEffect(() => {
    if (!coupleId || !packId || questions.length === 0 || loading || isCompleted) return
    setSaving(true)
    saveProgress(coupleId, packId, levelNumber, currentIndex, false)
      .finally(() => setSaving(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Mark level completed saat isCompleted flag jadi true (sekali saja)
  useEffect(() => {
    if (!isCompleted || !coupleId || !packId) return

    setSaving(true)
    let isMounted = true

    markLevelCompleted(coupleId, packId, levelNumber, questions.length)
      .then(({ unlockedNext }) => {
        if (!isMounted) return
        const next = allLevels.find(l => l.level_number === levelNumber + 1)
        // Show celebration hanya kalau: (1) baru pertama kali completed, (2) ada next level, (3) next level punya konten (bukan coming_soon)
        if (unlockedNext && next && (next.question_count ?? 0) > 0) {
          setNextLevel(next)
          setShowCelebration(true)
        }
      })
      .catch((err) => {
        console.error('Failed to mark level completed:', err)
      })
      .finally(() => {
        if (isMounted) setSaving(false)
      })

    return () => { isMounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted])

  function getAssignedName(index: number): string {
    // Deterministic turn order: compare user IDs alphabetically
    // Both players will get the same order regardless of who opens first
    const iAmFirst = myUserId < partnerUserId
    if (index % 2 === 0) return iAmFirst ? myName : partnerName
    return iAmFirst ? partnerName : myName
  }

  function goNext() {
    if (currentIndex >= questions.length - 1) {
      setIsCompleted(true)
    } else {
      setFlipped(false)
      setTimeout(() => setCurrentIndex(i => i + 1), 50)
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setFlipped(false)
      setTimeout(() => setCurrentIndex(i => i - 1), 50)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    )
  }

  if (!pack || questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-sm text-ink-muted">Pertanyaan tidak ditemukan</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-rose">Kembali</button>
      </div>
    )
  }

  // Completion screen
  if (isCompleted) {
    return (
      <>
        {showCelebration && nextLevel && (
          <UnlockCelebration
            levelNumber={nextLevel.level_number}
            levelTitle={nextLevel.title}
            questionCount={nextLevel.question_count ?? 0}
            onDismiss={() => setShowCelebration(false)}
          />
        )}
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-white text-center"
          style={{ background: `linear-gradient(135deg, ${pack.color ?? '#E07A9E'}, ${pack.color ?? '#E07A9E'}99)` }}
        >
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Trophy className="h-12 w-12 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-extrabold">Level {levelNumber} Selesai!</h1>
          <p className="mt-3 text-base text-white/80">
            Kalian baru saja menyelesaikan {questions.length} pertanyaan bersama. Luar biasa!
          </p>
          <div className="mt-8 w-full space-y-3">
            <button
              onClick={() => router.push(`/app/games/deep-talk/${packSlug}`)}
              className="w-full rounded-2xl bg-white py-4 text-sm font-bold text-ink shadow-elevated transition-all active:scale-[0.98]"
              style={{ color: pack.color ?? '#E07A9E' }}
            >
              Lihat Level Berikutnya
            </button>
            <button
              onClick={() => router.push('/app/games/deep-talk')}
              className="w-full rounded-2xl border border-white/30 py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            >
              Kembali ke Deep Talk
            </button>
          </div>
          {saving && <p className="mt-4 text-xs text-white/60 animate-pulse">Menyimpan progress...</p>}
        </div>
      </>
    )
  }

  const question = questions[currentIndex]
  const assignedName = getAssignedName(currentIndex)
  const isMyTurn = assignedName === myName
  const progress = ((currentIndex + 1) / questions.length) * 100

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: `linear-gradient(160deg, ${pack.color ?? '#E07A9E'}15, white 60%)` }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-safe pt-6 pb-2">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur-sm"
        >
          <X className="h-4 w-4 text-ink" />
        </button>

        <div className="flex-1 mx-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: pack.color ?? '#E07A9E' }}
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-ink-muted">
          {currentIndex + 1}/{questions.length}
        </span>
      </div>

      {/* Card area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* For whom label */}
        <div
          className="mb-5 rounded-full px-5 py-1.5 text-sm font-bold text-white shadow-sm"
          style={{ background: pack.color ?? '#E07A9E' }}
        >
          Pertanyaan untuk {assignedName}
        </div>

        {/* Question card */}
        <button
          onClick={() => setFlipped(f => !f)}
          className="w-full cursor-pointer rounded-3xl bg-white p-8 shadow-elevated text-center transition-all active:scale-[0.98]"
          style={{ minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <p className="text-xl font-bold leading-relaxed text-ink">
            {question.question_text}
          </p>
        </button>

        <p className="mt-4 text-xs text-ink-muted">Ketuk kartu untuk menandai sudah dibaca</p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 pb-safe pb-8 pt-4">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-white shadow-card disabled:opacity-30 transition-all active:scale-[0.95]"
        >
          <ChevronLeft className="h-5 w-5 text-ink" />
        </button>

        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex ? 'w-5' : 'w-1.5'
              }`}
              style={{
                background: i <= currentIndex ? (pack.color ?? '#E07A9E') : '#e5e7eb',
              }}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-elevated transition-all active:scale-[0.95]"
          style={{ background: pack.color ?? '#E07A9E' }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
