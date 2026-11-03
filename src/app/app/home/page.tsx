import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import { daysSince } from '@/lib/dates'
import { getTodayQuestion } from '@/data/dailyQuestions'
import CoupleProfileHero from '@/components/app/CoupleProfileHero'
import MissYouButton from '@/components/app/MissYouButton'
import MissYouToast from '@/components/app/MissYouToast'
import LettersBanner from '@/components/app/LettersBanner'
import DailyQuestionCard from '@/components/app/DailyQuestionCard'
import QuickAccessGrid from '@/components/app/QuickAccessGrid'
import AIDailyQuestionCard from '@/components/app/AIDailyQuestionCard'
import ActivityBell from '@/components/app/ActivityBell'
import MoodCheckinCard from '@/components/app/MoodCheckinCard'
import MilestoneCard from '@/components/app/MilestoneCard'
import OnThisDayCard from '@/components/moments/OnThisDayCard'

/** Earliest of the partners' start dates ("YYYY-MM-DD" sorts as text) */
function earliestDate(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d).sort()
  return valid[0] ?? null
}

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const user = await getServerUser(supabase)
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle()

  const { data: myMembership } = await supabase
    .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()

  let partnerName: string | null = null
  let partnerAvatar: string | null = null
  let partnerId: string | null = null
  let partnerStartDate: string | null = null

  if (myMembership?.couple_id) {
    const { data: allMembers } = await supabase
      .from('couple_members').select('profile_id')
      .eq('couple_id', myMembership.couple_id).neq('profile_id', user.id)
    if (allMembers?.[0]) {
      partnerId = allMembers[0].profile_id
      const { data: p } = await supabase
        .from('profiles').select('name, avatar_url, relationship_start_date')
        .eq('id', allMembers[0].profile_id).maybeSingle()
      partnerName = p?.name ?? null
      partnerAvatar = p?.avatar_url ?? null
      partnerStartDate = p?.relationship_start_date ?? null
    }
  }

  // Either partner may have set the start date; use the earliest one
  const relationshipStartDate = earliestDate(profile?.relationship_start_date, partnerStartDate)
  const daysTogether = relationshipStartDate ? Math.max(0, daysSince(relationshipStartDate)) : 0

  // Jakarta date — this page renders on the server (UTC)
  const { question, index } = getTodayQuestion()

  const coupleId = myMembership?.couple_id ?? null

  return (
    <div className="relative animate-fade-in">
      {/* ===== ACTIVITY BELL (partner's latest actions, unread badge) ===== */}
      <ActivityBell coupleId={coupleId} userId={user.id} className="absolute right-4 top-4 z-10" />

      {/* ===== COUPLE HERO (big avatars) + KANGEN BUTTON ===== */}
      <CoupleProfileHero
        myName={profile?.name ?? null}
        partnerName={partnerName}
        myAvatarUrl={profile?.avatar_url ?? null}
        partnerAvatarUrl={partnerAvatar}
        daysTogether={daysTogether}
        relationshipStartDate={relationshipStartDate}
      >
        <MissYouButton
          myId={user.id}
          myName={profile?.name ?? 'Seseorang'}
          partnerId={partnerId}
          partnerName={partnerName}
          coupleId={myMembership?.couple_id ?? null}
        />
      </CoupleProfileHero>

      <div className="space-y-5 pb-6 pt-4">
        {/* ===== KANGEN RECEIVED (reply "kangen kamu juga") ===== */}
        <MissYouToast
          myId={user.id}
          myName={profile?.name ?? 'Pasanganmu'}
          partnerId={partnerId}
          partnerName={partnerName}
          coupleId={myMembership?.couple_id ?? null}
        />

        {/* ===== MOOD CHECK-IN (mine + partner's today) ===== */}
        <MoodCheckinCard coupleId={coupleId} userId={user.id} partnerId={partnerId} partnerName={partnerName} />

        {/* ===== NEXT MILESTONE + ON THIS DAY ===== */}
        <MilestoneCard startDate={relationshipStartDate} />
        <OnThisDayCard coupleId={coupleId} />

        {/* ===== SURAT RAHASIA (with notification badge when unread) ===== */}
        <LettersBanner myId={user.id} coupleId={myMembership?.couple_id ?? null} />

        {/* ===== AI DAILY QUESTION ===== */}
        <AIDailyQuestionCard coupleId={myMembership?.couple_id ?? null} />

        {/* ===== DAILY QUESTION (static) ===== */}
        <DailyQuestionCard
          question={question}
          questionIndex={index}
          coupleId={myMembership?.couple_id ?? null}
          userId={user.id}
          userName={profile?.name ?? null}
          partnerId={partnerId}
          partnerName={partnerName}
        />

        {/* ===== QUICK ACCESS 2x2 GRID ===== */}
        <div>
          <p className="mb-2 px-6 text-[10px] font-bold uppercase tracking-widest text-ink-muted/50">
            Akses Cepat
          </p>
          <QuickAccessGrid />
        </div>
      </div>
    </div>
  )
}
