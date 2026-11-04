// LIVE Claude calls: skipped unless CLAUDE_LIVE=1, so the normal suite never
// touches the network. Run through `node scripts/verify/ai-core.mjs --live`
// (one tiny call, at most 64 output tokens) or `--live --measure` (adds one
// real daily question and one real Date Ideas run, to measure their cost).
// Uses the local Supabase ledger; prints usage, never the key.
import { appendFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IDEA_INPUT, QUESTION_CONTEXT } from './helpers/fixtures'

const LIVE = process.env.CLAUDE_LIVE === '1'
const MEASURE = process.env.CLAUDE_MEASURE === '1'

/** Evidence line: to the console and, from ai-core.mjs, to CLAUDE_LIVE_OUT. */
function note(line: string) {
  console.log(line)
  if (process.env.CLAUDE_LIVE_OUT) appendFileSync(process.env.CLAUDE_LIVE_OUT, `${line}\n`)
}

vi.mock('@/lib/supabase-server', async () => {
  const { createClient: make } = await import('@supabase/supabase-js')
  return {
    createServerSupabaseClient: async () => { throw new Error('not used') },
    createServiceRoleClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
})

import { claudeJson, SONNET } from '@/lib/claude'
import { generateDailyQuestion } from '@/lib/daily-question'
import { generateDateIdeas } from '@/lib/date-ideas'

describe.skipIf(!LIVE)('live Sonnet', () => {
  let service: SupabaseClient
  let coupleId = ''

  const ledgerRows = async () => {
    const { data, error } = await service
      .from('ai_usage')
      .select('feature, day, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, outcome')
      .eq('couple_id', coupleId)
      .order('created_at')
    if (error) throw new Error(error.message)
    return data
  }

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error('refusing to run: Supabase is not local')
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
    delete process.env.ANTHROPIC_BASE_URL
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await service
      .from('couples').insert({ invite_code: `LIV${Math.random().toString(36).slice(2, 9).toUpperCase()}` }).select('id').single()
    if (error) throw new Error(`couple insert: ${error.message}`)
    coupleId = data.id as string
  })

  afterAll(async () => {
    if (coupleId) await service.from('couples').delete().eq('id', coupleId)
  })

  it('one tiny call through claudeJson succeeds and is logged in ai_usage', async () => {
    const r = await claudeJson<{ word: string }>({
      feature: 'daily_question',
      coupleId,
      system: 'You reply with JSON only.',
      prompt: 'Set "word" to the word ok.',
      schema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false },
      maxTokens: 64,
    })
    const rows = await ledgerRows()
    note(`[live] model ${SONNET} result ${JSON.stringify(r)}`)
    note(`[live] ai_usage rows ${JSON.stringify(rows)}`)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.usage.output).toBeLessThanOrEqual(64)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ feature: 'daily_question', outcome: 'ok', output_tokens: r.usage.output })
    expect(Number(rows[0].cost_usd)).toBe(r.usage.costUsd)
  }, 60_000)

  it.skipIf(!MEASURE)('measure: one real daily question and one real Date Ideas run', async () => {
    const q = await generateDailyQuestion(coupleId, QUESTION_CONTEXT)
    note(`[measure] daily question ${JSON.stringify(q)}`)
    const ideas = await generateDateIdeas(coupleId, IDEA_INPUT, { todayLabel: 'Wednesday, 4 November 2026', bucketTitles: ['Hike a volcano together'] })
    note(`[measure] date ideas ${JSON.stringify(ideas.ok ? { ok: true, usage: ideas.usage, titles: ideas.ideas.map((i) => i.title) } : ideas)}`)
    note(`[measure] ai_usage rows ${JSON.stringify(await ledgerRows())}`)
    expect(q.ok).toBe(true)
    expect(ideas.ok).toBe(true)
  }, 120_000)
})
