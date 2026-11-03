import { NextResponse } from 'next/server'
import { AISDKError } from 'ai'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { todayJakarta, formatDateID } from '@/lib/dates'
import { getLlm } from '@/lib/llm-config'
import { AI_NOT_CONFIGURED, describeProviderError, providerFailure } from '@/lib/ai-errors'
import { DateIdeasError, generateDateIdeas } from '@/lib/date-ideas'
import { DATE_IDEA_DAILY_LIMIT, parseDateIdeaInput } from '@/app/app/ide-date/options'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const QUOTA_MESSAGE = 'Kuota ide hari ini sudah habis, coba lagi besok'
const RETRY_MESSAGE = 'Gagal membuat ide, coba lagi'

function todayLabel(): string {
  const today = todayJakarta()
  const [y, m, d] = today.split('-').map(Number)
  return `${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${formatDateID(today)}`
}

/** Runs today (Jakarta day) that count against the quota: failed ones don't. */
async function remainingToday(admin: ReturnType<typeof createServiceRoleClient>, coupleId: string): Promise<number> {
  const dayStart = `${todayJakarta()}T00:00:00+07:00`
  const { count, error } = await admin
    .from('ai_date_idea_runs')
    .select('id', { count: 'exact', head: true })
    .eq('couple_id', coupleId)
    .gte('created_at', dayStart)
    .neq('status', 'failed')
  if (error) throw error
  return Math.max(0, DATE_IDEA_DAILY_LIMIT - (count ?? 0))
}

/**
 * Three date ideas from the model (F21, GPT Luna via OpenRouter). The quota
 * slot is claimed atomically with the service role before calling the model;
 * a failed generation marks the run 'failed', which gives the slot back.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    const coupleId = membership?.couple_id ?? null
    if (!coupleId) return NextResponse.json({ error: 'Belum punya pasangan' }, { status: 400 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
    }
    const parsed = parseDateIdeaInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const input = parsed.input

    // Key pasted in Admin → AI, else LLM_API_KEY.
    const llm = await getLlm()
    if (!llm.configured) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED.error }, { status: AI_NOT_CONFIGURED.status })
    }

    const admin = createServiceRoleClient()
    const { data: runId, error: claimError } = await admin.rpc('claim_date_idea_run', {
      p_couple: coupleId,
      p_profile: user.id,
      p_input: input,
      p_limit: DATE_IDEA_DAILY_LIMIT,
    })
    if (claimError) throw claimError
    if (!runId) return NextResponse.json({ error: QUOTA_MESSAGE, remaining: 0 }, { status: 429 })

    try {
      // Only titles, to steer away from repeats: no other personal data.
      const { data: bucket, error: bucketError } = await supabase
        .from('bucket_items').select('title').eq('couple_id', coupleId)
        .order('created_at', { ascending: false }).limit(40)
      if (bucketError) throw bucketError

      const ideas = await generateDateIdeas(llm, input, {
        todayLabel: todayLabel(),
        bucketTitles: (bucket ?? []).map((b) => b.title),
      })
      const { error: saveError } = await admin
        .from('ai_date_idea_runs').update({ ideas, status: 'done' }).eq('id', runId)
      if (saveError) throw saveError

      return NextResponse.json({ runId, ideas, remaining: await remainingToday(admin, coupleId) })
    } catch (err) {
      // Give the quota slot back.
      await admin.from('ai_date_idea_runs').update({ status: 'failed' }).eq('id', runId)
      throw err
    }
  } catch (error) {
    const failure = providerFailure(error, RETRY_MESSAGE)
    if (failure) {
      if (failure.status !== 429) console.error('[ai/date-ideas] provider error', describeProviderError(error))
      return NextResponse.json({ error: failure.error }, { status: failure.status })
    }
    // DateIdeasError: wrong shape or failed checks. AISDKError: any other
    // malformed provider response the SDK could not use.
    if (error instanceof DateIdeasError || AISDKError.isInstance(error)) {
      console.error('[ai/date-ideas] unusable answer:', error.message)
      return NextResponse.json({ error: 'Idenya kurang pas, coba minta lagi ya' }, { status: 502 })
    }
    console.error('[ai/date-ideas] error:', error)
    return NextResponse.json({ error: RETRY_MESSAGE }, { status: 500 })
  }
}
