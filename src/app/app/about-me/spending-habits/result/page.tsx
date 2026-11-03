'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Share2, Users, Sparkles } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { SPENDING_TYPES, type SpendingType } from '@/lib/spending-assessment/types'
import { getCompatibility } from '@/lib/spending-assessment/compatibility'
import { Button } from '@/components/ui/Button'

interface ResultData {
  spending_type: string
  scores: Record<string, number>
}

export default function SpendingResultPage() {
  const router = useRouter()
  const [myResult, setMyResult] = useState<ResultData | null>(null)
  const [partnerResult, setPartnerResult] = useState<ResultData | null>(null)
  const [partnerName, setPartnerName] = useState<string>('Pasangan')
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const user = await getClientUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data: membership } = await supabase
        .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()

      if (!membership?.couple_id) { setLoading(false); return }

      // Get my result
      const { data: mine } = await supabase
        .from('spending_results')
        .select('spending_type, scores')
        .eq('couple_id', membership.couple_id)
        .eq('profile_id', user.id)
        .maybeSingle()

      if (mine) setMyResult(mine as unknown as ResultData)

      // Get partner result
      const { data: partnerMembers } = await supabase
        .from('couple_members').select('profile_id')
        .eq('couple_id', membership.couple_id).neq('profile_id', user.id)

      if (partnerMembers?.[0]) {
        const { data: pp } = await supabase.from('profiles').select('name').eq('id', partnerMembers[0].profile_id).single()
        if (pp?.name) setPartnerName(pp.name)

        const { data: theirs } = await supabase
          .from('spending_results')
          .select('spending_type, scores')
          .eq('couple_id', membership.couple_id)
          .eq('profile_id', partnerMembers[0].profile_id)
          .maybeSingle()

        if (theirs) setPartnerResult(theirs as unknown as ResultData)
      }

      setLoading(false)
      // Trigger reveal animation
      setTimeout(() => setRevealed(true), 300)
    }
    load()
  }, [router])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" /></div>
  }

  const myType = myResult ? SPENDING_TYPES[myResult.spending_type as SpendingType] : undefined

  if (!myResult || !myType) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-6">
        <p className="mb-4 text-ink-muted">Belum ada hasil. Ambil tes dulu!</p>
        <Button onClick={() => router.push('/app/about-me/spending-habits/questions')}>Mulai Tes</Button>
      </div>
    )
  }

  const partnerType = partnerResult ? SPENDING_TYPES[partnerResult.spending_type as SpendingType] ?? null : null
  const compat = partnerType ? getCompatibility(myType.id, partnerType.id) : null

  return (
    <div className="animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-white px-6 py-4">
        <button onClick={() => router.push('/app/about-me')} className="rounded-lg p-1 hover:bg-cream">
          <ArrowLeft className="h-5 w-5 text-ink-muted" />
        </button>
        <h1 className="text-lg font-bold text-ink">Spending Habits</h1>
      </div>

      <div className="space-y-5 px-6 pt-6">
        {/* ===== TYPE REVEAL ===== */}
        <div
          className={`rounded-3xl p-6 text-center transition-all duration-700 ${revealed ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
          style={{ backgroundColor: myType.color + '15' }}
        >
          <span className="text-5xl">{myType.emoji}</span>
          <h2 className="mt-3 text-2xl font-extrabold text-ink">{myType.name}</h2>
          <p className="mt-1 text-sm font-medium italic" style={{ color: myType.color }}>
            &ldquo;{myType.tagline}&rdquo;
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            {myType.description}
          </p>
        </div>

        {/* Strengths */}
        <div className="rounded-2xl border border-sage/20 bg-sage/5 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sage-dark">Kekuatan</p>
          <ul className="space-y-1.5">
            {myType.strengths.map(s => (
              <li key={s} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-0.5 text-sage-dark">+</span> {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Blind spots */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-700">Blind Spot</p>
          <ul className="space-y-1.5">
            {myType.blindSpots.map(s => (
              <li key={s} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-0.5 text-amber-600">!</span> {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Resonant quote */}
        <div className="rounded-2xl border border-border bg-cream p-4 text-center">
          <p className="text-sm italic text-ink-muted">&ldquo;{myType.resonantQuote}&rdquo;</p>
        </div>

        {/* ===== COMPATIBILITY ===== */}
        {compat && partnerType ? (
          <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-rose-50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">Compatibility</span>
            </div>

            {/* Side by side */}
            <div className="mb-4 flex items-center justify-center gap-4">
              <div className="text-center">
                <span className="text-3xl">{myType.emoji}</span>
                <p className="mt-1 text-xs font-bold text-ink">Kamu</p>
              </div>
              <Sparkles className="h-5 w-5 text-purple-400" />
              <div className="text-center">
                <span className="text-3xl">{partnerType.emoji}</span>
                <p className="mt-1 text-xs font-bold text-ink">{partnerName}</p>
              </div>
            </div>

            <h3 className="mb-2 text-base font-extrabold text-ink">{compat.headline}</h3>
            <p className="mb-4 text-sm leading-relaxed text-ink-muted">{compat.insight}</p>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-purple-600">Tips</p>
              {compat.tips.map((tip, i) => (
                <p key={i} className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 text-purple-500">{i + 1}.</span> {tip}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/30 p-5 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-purple-400" />
            <p className="text-sm font-semibold text-ink">Pasanganmu belum tes</p>
            <p className="mt-1 text-xs text-ink-muted">Ajak {partnerName} tes juga untuk lihat compatibility kalian!</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button onClick={() => router.push('/app/about-me/spending-habits/questions')} variant="secondary" size="lg">
            Tes Ulang
          </Button>
          <button
            onClick={() => router.push('/app/about-me')}
            className="w-full py-3 text-center text-sm font-medium text-ink-muted hover:text-ink"
          >
            Kembali ke About Me
          </button>
        </div>
      </div>
    </div>
  )
}
