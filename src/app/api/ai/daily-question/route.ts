import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { daysSince, todayJakarta } from '@/lib/dates'
import { getLlm } from '@/lib/llm-config'
import { AI_NOT_CONFIGURED, describeProviderError, providerFailure } from '@/lib/ai-errors'
import { generateDailyQuestion, type DailyQuestionContext } from '@/lib/daily-question'

// A claim older than this with no question means the generating request died.
const STALE_CLAIM_MS = 90_000
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const RETRY_MESSAGE = 'Couldn\'t make a question. Try again.'

function dayOfWeekJakarta(): string {
  const [y, m, d] = todayJakarta().split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function ageFrom(birthday: string | null | undefined): number | null {
  if (!birthday) return null
  return Math.floor(daysSince(birthday) / 365.25)
}

async function getCoupleId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data } = await supabase
    .from('couple_members').select('couple_id').eq('profile_id', userId).maybeSingle()
  return data?.couple_id ?? null
}

/**
 * Generates today's question once per couple. The first request claims the
 * (couple, date) row with the service role; only the claimant calls the model
 * (GPT Luna via OpenRouter), so double taps, both partners at once, or
 * deleting the row can't run up cost.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const coupleId = await getCoupleId(supabase, user.id)
    if (!coupleId) return NextResponse.json({ error: 'You\'re not connected with a partner yet' }, { status: 400 })

    // Key pasted in Admin → AI, else LLM_API_KEY.
    const llm = await getLlm()
    if (!llm.configured) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED.error }, { status: AI_NOT_CONFIGURED.status })
    }

    const today = todayJakarta()
    const admin = createServiceRoleClient()

    // Claim today's slot (unique couple_id + question_date).
    const { data: claimed, error: claimError } = await admin
      .from('ai_daily_questions')
      .insert({ couple_id: coupleId, question_date: today, question: null, generated_by: user.id })
      .select('id')
      .maybeSingle()

    let claimId = claimed?.id ?? null
    if (!claimId) {
      if (claimError && claimError.code !== '23505') throw claimError
      const { data: existing } = await admin
        .from('ai_daily_questions')
        .select('id, question, created_at')
        .eq('couple_id', coupleId).eq('question_date', today)
        .maybeSingle()
      if (existing?.question) {
        return NextResponse.json({ question: existing.question, alreadyGenerated: true })
      }
      // Take over a claim whose request died; otherwise someone is generating now.
      const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
      const { data: retaken } = existing
        ? await admin
            .from('ai_daily_questions')
            .update({ created_at: new Date().toISOString(), generated_by: user.id })
            .eq('id', existing.id).is('question', null).lt('created_at', staleBefore)
            .select('id').maybeSingle()
        : { data: null }
      if (!retaken) {
        return NextResponse.json(
          { question: null, pending: true, error: 'Today\'s question is being made. Try again in a moment.' },
          { status: 202 }
        )
      }
      claimId = retaken.id
    }

    try {
      const context = await buildContext(supabase, user.id, coupleId, today)
      const question = await generateDailyQuestion(llm, context)
      // generated_by: the claimant's id while pending, the model id once saved.
      await admin
        .from('ai_daily_questions')
        .update({ question, context_used: context, generated_by: llm.modelId })
        .eq('id', claimId)
      return NextResponse.json({ question, alreadyGenerated: false })
    } catch (err) {
      // Release the claim so the next tap can try again.
      await admin.from('ai_daily_questions').delete().eq('id', claimId).is('question', null)
      throw err
    }
  } catch (error) {
    const failure = providerFailure(error, RETRY_MESSAGE)
    if (failure) {
      if (failure.status !== 429) console.error('[ai/daily-question] provider error', describeProviderError(error))
      return NextResponse.json({ error: failure.error }, { status: failure.status })
    }
    console.error('[ai/daily-question] error:', error)
    return NextResponse.json({ error: RETRY_MESSAGE }, { status: 500 })
  }
}

async function buildContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  coupleId: string,
  today: string
): Promise<DailyQuestionContext> {
  const [{ data: myProfile }, { data: partnerMembers }, { data: myMbti }, { data: recent }, { data: upcoming }] =
    await Promise.all([
      supabase.from('profiles').select('name, gender, birthday, relationship_start_date').eq('id', userId).single(),
      supabase.from('couple_members').select('profile_id').eq('couple_id', coupleId).neq('profile_id', userId),
      supabase.from('mbti_results').select('mbti_type').eq('profile_id', userId)
        .order('taken_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ai_daily_questions').select('question').eq('couple_id', coupleId)
        .not('question', 'is', null).order('question_date', { ascending: false }).limit(7),
      supabase.from('couple_events').select('title, event_date').eq('couple_id', coupleId)
        .gte('event_date', today).order('event_date').limit(3),
    ])

  const partnerId = partnerMembers?.[0]?.profile_id
  const [{ data: partnerProfile }, { data: partnerMbti }] = partnerId
    ? await Promise.all([
        supabase.from('profiles').select('name, gender, birthday, relationship_start_date').eq('id', partnerId).single(),
        supabase.from('mbti_results').select('mbti_type').eq('profile_id', partnerId)
          .order('taken_at', { ascending: false }).limit(1).maybeSingle(),
      ])
    : [{ data: null }, { data: null }]

  // Either partner may be the one who filled in the start date.
  const startDates = [myProfile?.relationship_start_date, partnerProfile?.relationship_start_date]
    .filter((d): d is string => !!d).sort()

  return {
    myName: myProfile?.name ?? null,
    myGender: myProfile?.gender ?? null,
    myAge: ageFrom(myProfile?.birthday),
    myMbti: myMbti?.mbti_type ?? null,
    partnerName: partnerProfile?.name ?? null,
    partnerGender: partnerProfile?.gender ?? null,
    partnerAge: ageFrom(partnerProfile?.birthday),
    partnerMbti: partnerMbti?.mbti_type ?? null,
    daysTogether: startDates[0] ? daysSince(startDates[0]) : null,
    dayOfWeek: dayOfWeekJakarta(),
    upcomingEvents: (upcoming ?? []).map((e) => `${e.title} (${e.event_date})`),
    recentQuestions: (recent ?? []).map((q) => q.question as string),
  }
}

// GET: today's AI question (Jakarta date) if it exists.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const coupleId = await getCoupleId(supabase, user.id)
    if (!coupleId) return NextResponse.json({ question: null })

    const { data, error } = await supabase
      .from('ai_daily_questions')
      .select('question')
      .eq('couple_id', coupleId)
      .eq('question_date', todayJakarta())
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ question: data?.question ?? null, pending: !!data && !data.question })
  } catch (error) {
    console.error('[ai/daily-question] GET error:', error)
    return NextResponse.json({ error: 'Couldn\'t load the question' }, { status: 500 })
  }
}
