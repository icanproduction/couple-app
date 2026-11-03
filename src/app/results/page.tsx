'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  MessageCircle, Compass, Wallet, Users, Heart,
  ArrowRight, RotateCcw, TrendingUp, Sprout, Share2,
} from 'lucide-react'
import { questions, DIMENSION_LABELS, type Dimension } from '@/data/questions'
import { createClient } from '@/lib/supabase'
import { getMyCouplePremium } from '@/lib/premium'
import { PremiumGate } from '@/components/app/PremiumGate'

const DIMENSION_ICON_MAP: Record<Dimension, React.ElementType> = {
  komunikasi: MessageCircle,
  nilai_visi: Compass,
  keuangan: Wallet,
  keluarga: Users,
  komitmen: Heart,
}

interface DimensionScore {
  dimension: Dimension
  score: number
  maxScore: number
  percentage: number
}

function calculateScores(answers: Record<number, number | string>): DimensionScore[] {
  const dimensions: Dimension[] = ['komunikasi', 'nilai_visi', 'keuangan', 'keluarga', 'komitmen']

  return dimensions.map((dim) => {
    const dimQuestions = questions.filter((q) => q.dimension === dim)
    let score = 0
    let maxScore = 0

    dimQuestions.forEach((q) => {
      const answer = answers[q.id]
      if (q.type === 'agree_disagree' || q.type === 'scale') {
        score += typeof answer === 'number' ? answer : 3
        maxScore += 5
      } else if (q.type === 'priority') {
        score += 3
        maxScore += 5
      }
    })

    return { dimension: dim, score, maxScore, percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0 }
  })
}

function getOverallScore(scores: DimensionScore[]): number {
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0)
  const totalMax = scores.reduce((sum, s) => sum + s.maxScore, 0)
  return Math.round((totalScore / totalMax) * 100)
}

function getScoreLabel(percentage: number): string {
  if (percentage >= 80) return 'Sangat Siap!'
  if (percentage >= 60) return 'Cukup Siap'
  if (percentage >= 40) return 'Perlu Diskusi'
  return 'Masih Perlu Waktu'
}

function getScoreStyle(percentage: number) {
  if (percentage >= 80) return { text: 'text-sage-dark', bg: 'bg-sage/10', bar: 'bg-sage' }
  if (percentage >= 60) return { text: 'text-sage', bg: 'bg-sage/10', bar: 'bg-sage-light' }
  if (percentage >= 40) return { text: 'text-gold-dark', bg: 'bg-gold/10', bar: 'bg-gold' }
  return { text: 'text-danger', bg: 'bg-danger/10', bar: 'bg-danger' }
}

type Answers = Record<number, number | string>

// Written by /assessment; holds answers that haven't been saved yet.
const PENDING_KEY = 'assessment_answers'

function readPendingAnswers(): Answers | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as Answers) : null
  } catch {
    return null
  }
}

type SaveResult = { ok: true; guest?: boolean } | { ok: false; message: string }

async function saveAnswers(answers: Answers): Promise<SaveResult> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: true, guest: true } // Not logged in — nothing to save to

    const { data: membership } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    // Build scores object: { "Komunikasi": 4.2, "Nilai & Visi": 3.8, ... }
    const scoresObj: Record<string, number> = {}
    calculateScores(answers).forEach(s => {
      scoresObj[DIMENSION_LABELS[s.dimension]] = Number((s.score / s.maxScore * 5).toFixed(1))
    })

    const { error } = await supabase.from('assessment_results').insert({
      profile_id: user.id,
      couple_id: membership?.couple_id ?? null,
      answers,
      scores: scoresObj,
    })
    return error ? { ok: false, message: error.message } : { ok: true }
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : 'Koneksi bermasalah' }
  }
}

/** The signed-in user's most recent saved answers, for revisiting results. */
async function loadLatestAnswers(): Promise<Answers | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('assessment_results')
    .select('answers')
    .eq('profile_id', user.id)
    .order('taken_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const answers = data?.answers
  return answers && typeof answers === 'object' && !Array.isArray(answers) ? (answers as unknown as Answers) : null
}

export default function ResultsPage() {
  const [scores, setScores] = useState<DimensionScore[]>([])
  const [overall, setOverall] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Answers | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'history' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [isPremium, setIsPremium] = useState(false)
  const saveAttempted = useRef(false)

  const showAnswers = useCallback((answers: Answers) => {
    const calculated = calculateScores(answers)
    setScores(calculated)
    setOverall(getOverallScore(calculated))
  }, [])

  const save = useCallback(async (answers: Answers) => {
    setSaveState('saving')
    setSaveError('')
    const result = await saveAnswers(answers)
    if (!result.ok) {
      setSaveState('error')
      setSaveError(result.message)
      return
    }
    if (result.guest) { setSaveState('idle'); return }
    // Saved: drop the pending copy so a reload doesn't insert it a second time.
    try { sessionStorage.removeItem(PENDING_KEY) } catch { /* storage unavailable */ }
    setPending(null)
    setSaveState('saved')
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const answers = readPendingAnswers()
      if (answers) {
        showAnswers(answers)
        setPending(answers)
        setLoading(false)
        if (!saveAttempted.current) {
          saveAttempted.current = true
          save(answers)
        }
        return
      }
      const latest = await loadLatestAnswers().catch(() => null)
      if (cancelled) return
      if (latest) {
        showAnswers(latest)
        setSaveState('history')
      }
      setLoading(false)
    }
    init()
    getMyCouplePremium().then((p) => { if (!cancelled) setIsPremium(!!p?.isPremium) })
    return () => { cancelled = true }
  }, [showAnswers, save])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    )
  }

  if (scores.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50">
          <Heart className="h-6 w-6 text-rose" strokeWidth={1.5} />
        </div>
        <p className="mb-6 text-sm text-ink-muted">Belum ada hasil assessment.</p>
        <Link href="/assessment"
          className="inline-flex items-center gap-2 rounded-2xl bg-rose px-6 py-3 text-sm font-semibold text-white shadow-elevated">
          Mulai Assessment <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  const strengths = scores.filter((s) => s.percentage >= 60)
  const growthAreas = scores.filter((s) => s.percentage < 60)
  const style = getScoreStyle(overall)

  return (
    <div className="min-h-screen px-6 py-8">
      {/* Save status */}
      {saveState === 'saved' && (
        <div className="mb-4 rounded-xl bg-sage/10 px-4 py-2 text-center text-xs font-medium text-sage-dark">
          Hasil tersimpan di profilmu
        </div>
      )}
      {saveState === 'history' && (
        <div className="mb-4 rounded-xl bg-cream px-4 py-2 text-center text-xs font-medium text-ink-muted">
          Hasil assessment terakhirmu
        </div>
      )}
      {saveState === 'error' && (
        <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          <p>Hasil belum tersimpan: {saveError}</p>
          {pending && (
            <button onClick={() => save(pending)} className="mt-1.5 font-semibold underline">
              Coba simpan lagi
            </button>
          )}
        </div>
      )}

      {/* Overall score */}
      <div className="animate-scale-in mb-8 rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-muted">Skor Kesiapan</p>
        <p className={`text-5xl font-bold ${style.text}`}>{overall}%</p>
        <p className={`mt-2 text-sm font-semibold ${style.text}`}>{getScoreLabel(overall)}</p>
      </div>

      {/* Free tier paywall */}
      {!isPremium && (
        <div className="mb-8">
          <PremiumGate
            title="Lihat Hasil Lengkap"
            subtitle="Buka breakdown per dimensi, area bertumbuh, dan kartu hasil."
            perks={['Breakdown skor per dimensi', 'Area untuk bertumbuh', 'Kartu hasil siap dibagikan', 'Semua level Deep Talk']}
            onUnlocked={() => setIsPremium(true)}
          />
        </div>
      )}

      {/* Premium content */}
      {isPremium && (
        <>
          {/* Shareable card */}
          <a
            href={`/api/share-card?score=${overall}&label=${encodeURIComponent(getScoreLabel(overall))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose/20 bg-rose/5 px-6 py-3.5 text-sm font-semibold text-rose shadow-card transition-all active:scale-[0.98]"
          >
            <Share2 className="h-4 w-4" /> Bagikan Kartu Hasil
          </a>

      {/* Per-dimension breakdown */}
      <div className="animate-slide-up mb-8">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-muted">Breakdown per Dimensi</h3>
        <div className="space-y-3">
          {scores.map((s) => {
            const Icon = DIMENSION_ICON_MAP[s.dimension]
            const dimStyle = getScoreStyle(s.percentage)
            return (
              <div key={s.dimension} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50">
                      <Icon className="h-4 w-4 text-rose" strokeWidth={1.5} />
                    </div>
                    <span className="text-sm font-semibold text-ink">{DIMENSION_LABELS[s.dimension]}</span>
                  </div>
                  <span className={`text-sm font-bold ${dimStyle.text}`}>{s.percentage}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div className={`h-full rounded-full transition-all duration-700 ease-out ${dimStyle.bar}`} style={{ width: `${s.percentage}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sage" strokeWidth={1.5} />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Kekuatan Kalian</h3>
          </div>
          <div className="space-y-2">
            {strengths.map((s) => {
              const Icon = DIMENSION_ICON_MAP[s.dimension]
              return (
                <div key={s.dimension} className="flex items-center gap-3 rounded-2xl border border-sage/20 bg-sage/5 px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-sage" strokeWidth={1.5} />
                  <p className="text-sm text-sage-dark">
                    <span className="font-semibold">{DIMENSION_LABELS[s.dimension]}</span> — kalian sudah di jalur yang tepat!
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Growth areas */}
      {growthAreas.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Sprout className="h-4 w-4 text-gold-dark" strokeWidth={1.5} />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Area untuk Bertumbuh</h3>
          </div>
          <div className="space-y-2">
            {growthAreas.map((s) => {
              const Icon = DIMENSION_ICON_MAP[s.dimension]
              return (
                <div key={s.dimension} className="flex items-center gap-3 rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-gold-dark" strokeWidth={1.5} />
                  <p className="text-sm text-gold-dark">
                    <span className="font-semibold">{DIMENSION_LABELS[s.dimension]}</span> — coba diskusikan lebih dalam bersama pasangan.
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
        </>
      )}

      {/* CTAs */}
      <div className="space-y-3 pb-8">
        <Link href="/app/home"
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-rose px-6 py-3.5 text-sm font-semibold text-white shadow-elevated transition-all hover:bg-rose-dark active:scale-[0.98]">
          Kembali ke Beranda <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/assessment"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-6 py-3.5 text-sm font-semibold text-ink-light shadow-card transition-all active:scale-[0.98]">
          <RotateCcw className="h-4 w-4" /> Ulangi Assessment
        </Link>
      </div>
    </div>
  )
}
