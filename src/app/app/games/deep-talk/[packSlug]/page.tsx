'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, Lock, CheckCircle2, Play, RotateCcw, Sparkles } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { getPackBySlug, getLevelsForPack, getProgress, getLevelStatus, getPrerequisiteLevel } from '@/lib/deep-talk'
import type { DeepTalkPack, DeepTalkLevel, DeepTalkProgress, LevelStatus } from '@/lib/deep-talk'
import { PremiumGate } from '@/components/app/PremiumGate'
import DeepTalkPackIcon from '@/components/game/DeepTalkPackIcon'

const LEVEL_COLORS = [
  { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200' },
  { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', ring: 'ring-amber-200' },
  { bg: 'bg-rose/5', text: 'text-rose', badge: 'bg-rose/10 text-rose', ring: 'ring-rose/20' },
]

const LEVEL_EMOJIS = ['🌱', '🌿', '🔥']

export default function PackDetailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { packSlug } = useParams<{ packSlug: string }>()

  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [pack, setPack] = useState<DeepTalkPack | null>(null)
  const [levels, setLevels] = useState<DeepTalkLevel[]>([])
  const [progress, setProgress] = useState<DeepTalkProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [lockedToast, setLockedToast] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) {
      setLoading(false)
      router.replace('/auth/login')
      return
    }

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (membership?.couple_id) {
      setCoupleId(membership.couple_id)
      const { data: couple } = await supabase
        .from('couples').select('is_premium').eq('id', membership.couple_id).single()
      setIsPremium(!!couple?.is_premium)
    }

    const p = await getPackBySlug(packSlug)
    if (!p) { setLoading(false); return }
    setPack(p)

    const [lvls, prog] = await Promise.all([
      getLevelsForPack(p.id),
      membership?.couple_id ? getProgress(membership.couple_id, p.id) : Promise.resolve(null),
    ])
    setLevels(lvls)
    setProgress(prog)
    setLoading(false)
  }, [packSlug, router])

  useEffect(() => {
    loadData().catch((err) => {
      console.error('[deep-talk] gagal memuat pack:', err)
      setLoading(false)
    })
  }, [loadData])

  // Toast for redirects from a level URL that is not playable yet. Waits for
  // the levels so the "finish Level N first" number skips empty levels.
  useEffect(() => {
    if (loading) return
    const lockedParam = searchParams.get('locked')
    const comingSoonParam = searchParams.get('coming_soon')
    const premiumParam = searchParams.get('premium')
    if (lockedParam) {
      const prerequisite = getPrerequisiteLevel(Number(lockedParam), levels)
      setLockedToast(prerequisite
        ? `Selesaikan Level ${prerequisite} dulu untuk membuka Level ${lockedParam} ✨`
        : `Level ${lockedParam} belum bisa dibuka ✨`)
    } else if (premiumParam) {
      setLockedToast('Level ini fitur Premium — buka Premium dulu ya ✨')
    } else if (comingSoonParam) {
      setLockedToast(`Level ${comingSoonParam} masih dalam persiapan, nantikan ya 🌟`)
    }
  }, [searchParams, loading, levels])

  useEffect(() => {
    if (!lockedToast) return
    const timer = setTimeout(() => setLockedToast(null), 2000)
    return () => clearTimeout(timer)
  }, [lockedToast])

  function getButtonLabel(status: LevelStatus): string {
    if (status === 'coming_soon') return 'Segera Hadir'
    if (status === 'locked') return 'Terkunci'
    if (status === 'completed') return 'Main Lagi'
    return 'Mulai'
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  if (!pack) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-sm text-ink-muted">Pack tidak ditemukan</p>
        <button onClick={() => router.push('/app/games/deep-talk')} className="mt-4 text-sm text-rose">Kembali</button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in pb-6">
      {/* Header */}
      <div
        className="px-6 pb-8 pt-6 text-white"
        style={{ background: `linear-gradient(135deg, ${pack.color ?? '#E07A9E'}, ${pack.color ?? '#E07A9E'}cc)` }}
      >
        <button onClick={() => router.push('/app/games/deep-talk')} className="mb-4 flex items-center gap-1 text-sm text-white/80">
          <ArrowLeft className="h-4 w-4" /> Deep Talk
        </button>
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
          <DeepTalkPackIcon name={pack.icon_name} className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold">{pack.title}</h1>
        <p className="mt-1 text-sm text-white/80">{pack.description}</p>
        {pack.is_free && (
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold">
            <Sparkles className="h-3 w-3" /> Semua level terbuka, pilih mana saja
          </span>
        )}
      </div>

      {/* Levels */}
      <div className="space-y-3 px-6 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Pilih Level</p>

        {levels.map((level, idx) => {
          const status = getLevelStatus(level, progress?.completed_levels ?? [], isPremium, levels, pack.is_free)
          const prerequisite = getPrerequisiteLevel(level.level_number, levels)
          const colors = LEVEL_COLORS[idx] ?? LEVEL_COLORS[0]
          const label = getButtonLabel(status)
          const isCompleted = status === 'completed'
          const isUnlocked = status === 'unlocked' || status === 'completed'
          const isComingSoon = status === 'coming_soon'
          const isPremiumLocked = status === 'premium_locked'

          return (
            <div
              key={level.id}
              onClick={() => {
                if (status === 'locked') {
                  setLockedToast(`Selesaikan Level ${prerequisite ?? level.level_number - 1} dulu untuk membuka ini ✨`)
                } else if (isPremiumLocked) {
                  setLockedToast('Buka Premium untuk main level ini ✨')
                }
              }}
              className={`rounded-2xl border p-4 transition-all ${
                isUnlocked
                  ? 'border-border bg-white shadow-card'
                  : isComingSoon
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-border bg-cream/30 opacity-70 cursor-pointer'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-xl ${
                  isUnlocked ? colors.bg : isComingSoon ? 'bg-amber-100' : 'bg-cream'
                }`}>
                  {isUnlocked ? (LEVEL_EMOJIS[idx] ?? '💬') : isComingSoon ? '🌟' : isPremiumLocked ? '✨' : '🔒'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold ${isUnlocked ? 'text-ink' : 'text-ink-muted'}`}>
                      Level {level.level_number}: {level.title}
                    </p>
                    {isCompleted && <CheckCircle2 className="h-4 w-4 text-sage" />}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">{level.description}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isUnlocked ? colors.badge : isComingSoon ? 'bg-amber-100 text-amber-700' : 'bg-cream text-ink-muted'
                    }`}>
                      {isComingSoon ? 'Segera Hadir' : `${level.question_count} pertanyaan`}
                    </span>
                  </div>
                </div>
              </div>

              {isUnlocked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!coupleId) return
                    router.push(`/app/games/deep-talk/${packSlug}/${level.level_number}`)
                  }}
                  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all active:scale-[0.98] ${
                    isCompleted
                      ? 'bg-cream text-ink-muted hover:bg-cream/80'
                      : `text-white shadow-sm`
                  }`}
                  style={!isCompleted ? { background: pack.color ?? '#E07A9E' } : {}}
                >
                  {isCompleted ? (
                    <><RotateCcw className="h-4 w-4" /> {label}</>
                  ) : (
                    <><Play className="h-4 w-4" /> {label}</>
                  )}
                </button>
              )}

              {status === 'locked' && (
                <div className="mt-3 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-ink-muted" />
                  <p className="text-xs text-ink-muted">Selesaikan Level {prerequisite ?? level.level_number - 1} untuk membuka</p>
                </div>
              )}

              {isPremiumLocked && (
                <div className="mt-3 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-rose" />
                  <p className="text-xs text-rose">Fitur premium — buka untuk main level ini</p>
                </div>
              )}

              {isComingSoon && (
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-xs text-amber-700">Konten level ini sedang dipersiapkan</p>
                </div>
              )}
            </div>
          )
        })}

        {!isPremium && !pack.is_free && levels.some((l) => l.level_number > 1 && (l.question_count ?? 0) > 0) && (
          <PremiumGate onUnlocked={() => setIsPremium(true)} />
        )}
      </div>

      {lockedToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white shadow-elevated max-w-[90vw]">
            {lockedToast}
          </div>
        </div>
      )}
    </div>
  )
}
