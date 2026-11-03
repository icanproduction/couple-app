'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Heart, Brain, Cake,
  Clock,
} from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { formatDateID, daysSince, getRelationshipLevel } from '@/lib/dates'
import AvatarUpload from '@/components/app/AvatarUpload'
import MbtiCard from '@/components/app/MbtiCard'
import WishlistSection from '@/components/app/WishlistSection'
import type { MbtiScores } from '@/data/mbtiQuestions'

interface PartnerProfile {
  id: string
  name: string | null
  birthday: string | null
  avatar_url: string | null
  relationship_start_date: string | null
}

interface MbtiResult {
  mbti_type: string
  scores: MbtiScores
  taken_at: string | null
}

interface WishlistItem {
  id: string; name: string; price: number | null; is_purchased: boolean
  owner_type: string | null; owner_id: string | null; link: string | null; image_url: string | null
}

function getZodiac(birthday: string): { sign: string; emoji: string } {
  const [, m, d] = birthday.split('-').map(Number)
  const zodiacs = [
    { sign: 'Capricorn', emoji: '\u2651', start: [1, 1], end: [1, 19] },
    { sign: 'Aquarius', emoji: '\u2652', start: [1, 20], end: [2, 18] },
    { sign: 'Pisces', emoji: '\u2653', start: [2, 19], end: [3, 20] },
    { sign: 'Aries', emoji: '\u2648', start: [3, 21], end: [4, 19] },
    { sign: 'Taurus', emoji: '\u2649', start: [4, 20], end: [5, 20] },
    { sign: 'Gemini', emoji: '\u264A', start: [5, 21], end: [6, 20] },
    { sign: 'Cancer', emoji: '\u264B', start: [6, 21], end: [7, 22] },
    { sign: 'Leo', emoji: '\u264C', start: [7, 23], end: [8, 22] },
    { sign: 'Virgo', emoji: '\u264D', start: [8, 23], end: [9, 22] },
    { sign: 'Libra', emoji: '\u264E', start: [9, 23], end: [10, 22] },
    { sign: 'Scorpio', emoji: '\u264F', start: [10, 23], end: [11, 21] },
    { sign: 'Sagittarius', emoji: '\u2650', start: [11, 22], end: [12, 21] },
    { sign: 'Capricorn', emoji: '\u2651', start: [12, 22], end: [12, 31] },
  ]
  return zodiacs.find(z => (m > z.start[0] || (m === z.start[0] && d >= z.start[1])) &&
    (m < z.end[0] || (m === z.end[0] && d <= z.end[1]))) ?? { sign: 'Unknown', emoji: '\u2728' }
}

export default function PartnerPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [partner, setPartner] = useState<PartnerProfile | null>(null)
  const [myProfile, setMyProfile] = useState<PartnerProfile | null>(null)
  const [partnerMbti, setPartnerMbti] = useState<MbtiResult | null>(null)
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }
    setUserId(user.id)

    // Get my profile
    const { data: myP } = await supabase.from('profiles').select('id, name, birthday, avatar_url, relationship_start_date').eq('id', user.id).maybeSingle()
    setMyProfile(myP)

    // Get couple
    const { data: membership } = await supabase.from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) { setLoading(false); return }
    setCoupleId(membership.couple_id)

    // Get partner profile
    const { data: partnerMembers } = await supabase
      .from('couple_members').select('profile_id').eq('couple_id', membership.couple_id).neq('profile_id', user.id)

    if (partnerMembers?.[0]) {
      const pid = partnerMembers[0].profile_id
      const { data: pp } = await supabase.from('profiles').select('id, name, birthday, avatar_url, relationship_start_date').eq('id', pid).maybeSingle()
      setPartner(pp)

      // Partner MBTI
      const { data: pMbti } = await supabase.from('mbti_results').select('mbti_type, scores, taken_at')
        .eq('profile_id', pid).order('taken_at', { ascending: false }).limit(1).maybeSingle()
      if (pMbti) setPartnerMbti(pMbti as unknown as MbtiResult)

    }

    // Wishlist
    const { data: wl } = await supabase.from('wishlist_items').select('*')
      .eq('couple_id', membership.couple_id).order('created_at', { ascending: false })
    setWishlist(wl ?? [])

    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  // Either partner may have set the start date; use the earliest one
  const startDate = [myProfile?.relationship_start_date, partner?.relationship_start_date]
    .filter((d): d is string => !!d).sort()[0] ?? null
  const daysTogether = startDate ? Math.max(0, daysSince(startDate)) : 0
  const level = getRelationshipLevel(daysTogether)
  const zodiac = partner?.birthday ? getZodiac(partner.birthday) : null

  return (
    <div className="animate-fade-in pb-6">
      {/* ===== PROFILE HEADER ===== */}
      <div className="relative overflow-hidden bg-gradient-to-br from-rose via-rose-dark to-[#d45a5a] px-6 pb-8 pt-8 text-white">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5" />

        <div className="relative flex flex-col items-center text-center">
          <AvatarUpload
            userId={partner?.id ?? ''}
            currentUrl={partner?.avatar_url ?? null}
            name={partner?.name ?? null}
            size="lg"
            editable={false}
          />
          <h1 className="mt-3 text-xl font-bold">{partner?.name ?? 'Pasanganmu'}</h1>
          {zodiac && (
            <span className="mt-1 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium backdrop-blur-sm">
              {zodiac.emoji} {zodiac.sign}
            </span>
          )}
          <div className="mt-3 flex items-center gap-4">
            {partner?.birthday && (
              <div className="flex items-center gap-1.5 text-xs text-white/70">
                <Cake className="h-3.5 w-3.5" />
                {formatDateID(partner.birthday)}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-white/70">
              <Clock className="h-3.5 w-3.5" />
              {daysTogether} hari bersama
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 pt-5">
        {/* ===== RELATIONSHIP LEVEL ===== */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-card">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose/10">
            <Heart className="h-5 w-5 text-rose" fill="currentColor" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-ink-muted">Level Hubungan</p>
            <p className="text-sm font-bold text-ink">{level}</p>
          </div>
          <span className="rounded-full bg-rose/10 px-3 py-1 text-xs font-bold text-rose">{daysTogether}h</span>
        </div>

        {/* ===== PARTNER MBTI ===== */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Kepribadian {partner?.name ?? 'Pasangan'}
          </h2>
          {partnerMbti ? (
            <MbtiCard mbtiType={partnerMbti.mbti_type} scores={partnerMbti.scores as MbtiScores} />
          ) : (
            <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/30 p-6 text-center">
              <Brain className="mx-auto mb-3 h-10 w-10 text-purple-300" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-ink">{partner?.name ?? 'Pasangan'} belum tes MBTI</p>
              <p className="mt-1 text-xs text-ink-muted">Ajak mereka ambil tes di menu About Me!</p>
            </div>
          )}
        </div>

        {/* ===== WISHLIST ===== */}
        {coupleId && userId && (
          <WishlistSection
            items={wishlist} coupleId={coupleId} userId={userId}
            userName={myProfile?.name ?? null} partnerId={partner?.id ?? null}
            partnerName={partner?.name ?? null} onRefresh={loadData}
          />
        )}
      </div>
    </div>
  )
}
