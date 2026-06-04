'use client'

import { useEffect, useState, useRef } from 'react'
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

export default function ResultsPage() {
  const [scores, setScores] = useState<DimensionScore[]>([])
  const [overall, setOverall] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const saveAttempted = useRef(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('assessment_answers')
    if (stored) {
      const answers = JSON.parse(stored)
      const calculated = calculateScores(answers)
      setScores(calculated)
      setOverall(getOverallScore(calculated))

      // Save to Supabase (only once)
      if (!saveAttempted.current) {
        saveAttempted.current = true
        saveToSupabase(answers, calculated)
      }
    }
    getMyCouplePremium().then((p) => setIsPremium(!!p?.isPremium))
    setMounted(true)
  }, [])

  async function saveToSupabase(
    answers: Record<number, number | string>,
    calculatedScores: DimensionScore[]
  ) {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return // Not logged in — skip saving (guest mode)

      // Get couple_id
      const { data: membership } = await supabase
        .from('couple_members')
        .select('couple_id')
        .eq('profile_id', user.id)
        .single()

      // Build scores object: { "Komunikasi": 4.2, "Nilai & Visi": 3.8, ... }
      const scoresObj: Record<string, number> = {}
      calculatedScores.forEach(s => {
        scoresObj[DIMENSION_LABELS[s.dimension]] = Number((s.score / s.maxScore * 5).toFixed(1))
      })

      await supabase.from('assessment_results').insert({
        profile_id: user.id,
        couple_id: membership?.couple_id ?? null,
        answers,
        scores: scoresObj,
      })

      setSaved(true)
    } catch {
      // Silently fail — results are still visible from sessionStorage
    }
  }

  if (!mounted) return null

  if (scores.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50">
          <Heart className="h-6 w-6 text-rose" strokeWidth={1.5} />
        </div>
        <p className="mb-6 text-sm text-ink-muted">Belum ada hasil assessment.</p>
        <Link href="/app/assessment"
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
      {/* Saved indicator */}
      {saved && (
        <div className="mb-4 rounded-xl bg-sage/10 px-4 py-2 text-center text-xs font-medium text-sage-dark">
          Hasil tersimpan di profilmu
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
        <Link href="/app/assessment"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-6 py-3.5 text-sm font-semibold text-ink-light shadow-card transition-all active:scale-[0.98]">
          <RotateCcw className="h-4 w-4" /> Ulangi Assessment
        </Link>
      </div>
    </div>
  )
}
