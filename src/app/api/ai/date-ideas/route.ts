import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { todayJakarta, formatDateID } from '@/lib/dates'
import { claudeConfigured } from '@/lib/claude'
import { AI_NOT_CONFIGURED, aiFailure, describeAiFailure, shouldLogFailure } from '@/lib/ai-errors'
import { generateDateIdeas } from '@/lib/date-ideas'
import { DATE_IDEA_DAILY_LIMIT, parseDateIdeaInput } from '@/app/app/ide-date/options'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const QUOTA_MESSAGE = 'You\'ve used up today\'s ideas. Try again tomorrow.'
const RETRY_MESSAGE = 'Couldn\'t make ideas. Try again.'
const INVALID_MESSAGE = 'Those ideas didn\'t come out right. Ask again.'

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
 * Three date ideas from the model (F21, Claude Sonnet). The quota slot is
 * claimed atomically with the service role before calling the model; a failed
 * generation (the daily AI cap included) marks the run 'failed', which gives
 * the slot back.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    const coupleId = membership?.couple_id ?? null
    if (!coupleId) return NextResponse.json({ error: 'You\'re not connected with a partner yet' }, { status: 400 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }
    const parsed = parseDateIdeaInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const input = parsed.input

    // No ANTHROPIC_API_KEY: answer before claiming quota.
    if (!claudeConfigured()) {
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

    // Give the quota slot back.
    const release = () => admin.from('ai_date_idea_runs').update({ status: 'failed' }).eq('id', runId)
    try {
      // Only titles, to steer away from repeats: no other personal data.
      const { data: bucket, error: bucketError } = await supabase
        .from('bucket_items').select('title').eq('couple_id', coupleId)
        .order('created_at', { ascending: false }).limit(40)
      if (bucketError) throw bucketError

      const result = await generateDateIdeas(coupleId, input, {
        todayLabel: todayLabel(),
        bucketTitles: (bucket ?? []).map((b) => b.title),
      })
      if (!result.ok) {
        await release()
        if (shouldLogFailure(result)) console.error('[ai/date-ideas] AI call failed:', describeAiFailure(result))
        const failure = aiFailure(result, { retry: RETRY_MESSAGE, invalid: INVALID_MESSAGE })
        return NextResponse.json({ error: failure.error }, { status: failure.status })
      }
      const { error: saveError } = await admin
        .from('ai_date_idea_runs').update({ ideas: result.ideas, status: 'done' }).eq('id', runId)
      if (saveError) throw saveError

      return NextResponse.json({ runId, ideas: result.ideas, remaining: await remainingToday(admin, coupleId) })
    } catch (err) {
      await release()
      throw err
    }
  } catch (error) {
    console.error('[ai/date-ideas] error:', error)
    return NextResponse.json({ error: RETRY_MESSAGE }, { status: 500 })
  }
}
