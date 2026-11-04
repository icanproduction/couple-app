// claudeJson against the LOCAL Supabase ledger (real ai_usage table and
// ai_usage_reserve RPC) and a local fake Messages API. Skipped unless
// AI_CORE_DB=1; scripts/verify/ai-core.mjs runs it with the local env.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { jsonMessage, startFakeAnthropic, type FakeAnthropic } from './helpers/fake-anthropic'

const RUN = process.env.AI_CORE_DB === '1'

vi.mock('@/lib/supabase-server', async () => {
  const { createClient: make } = await import('@supabase/supabase-js')
  return {
    createServerSupabaseClient: async () => { throw new Error('not used') },
    createServiceRoleClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
})

import { AI_DAILY_CAP_USD, aiSpendToday, claudeJson, worstCaseUsd, type AiFeature, type ClaudeJsonOptions } from '@/lib/claude'
import { todayJakarta } from '@/lib/dates'

const SCHEMA = {
  type: 'object',
  properties: { word: { type: 'string' } },
  required: ['word'],
  additionalProperties: false,
}

describe.skipIf(!RUN)('ai core against local Supabase', () => {
  let service: SupabaseClient
  let fake: FakeAnthropic
  let coupleId = ''
  const started = new Date().toISOString()

  const call = (feature: AiFeature, overrides: Partial<ClaudeJsonOptions> = {}) =>
    claudeJson<{ word: string }>({
      feature,
      coupleId,
      system: 'Answer with one word as JSON.',
      prompt: 'Say hi.',
      schema: SCHEMA,
      maxTokens: 1024,
      ...overrides,
    })

  const rows = async (feature: AiFeature) => {
    const { data, error } = await service
      .from('ai_usage').select('*').eq('couple_id', coupleId).eq('feature', feature).order('created_at')
    if (error) throw new Error(error.message)
    return data as Array<Record<string, unknown>>
  }

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error('refusing to run: Supabase is not local')
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await service
      .from('couples').insert({ invite_code: `AIC${Math.random().toString(36).slice(2, 9).toUpperCase()}` }).select('id').single()
    if (error) throw new Error(`couple insert: ${error.message}`)
    coupleId = data.id as string
    fake = await startFakeAnthropic()
  })

  beforeEach(() => {
    fake.reset()
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234'
    process.env.ANTHROPIC_BASE_URL = fake.baseUrl
  })

  afterAll(async () => {
    if (coupleId) await service.from('couples').delete().eq('id', coupleId)
    await service.from('ai_usage').delete().is('couple_id', null).gte('created_at', started)
    await fake?.close()
  })

  it('a successful call leaves one settled row with the real cost, on the Jakarta day', async () => {
    fake.reply(jsonMessage({ word: 'hi' }, { input_tokens: 400, output_tokens: 60 }))
    const r = await call('daily_question')
    expect(r).toMatchObject({ ok: true, data: { word: 'hi' }, usage: { costUsd: 0.0014 } })
    const [row] = await rows('daily_question')
    expect(row).toMatchObject({ outcome: 'ok', input_tokens: 400, output_tokens: 60, day: todayJakarta() })
    expect(Number(row.cost_usd)).toBe(0.0014)
    expect(await aiSpendToday(coupleId, 'daily_question')).toBe(0.0014)
  })

  it('at the cap: no call, no new row', async () => {
    await service.from('ai_usage').insert({ couple_id: coupleId, feature: 'date_ideas', cost_usd: AI_DAILY_CAP_USD.date_ideas, outcome: 'ok' })
    expect(await call('date_ideas')).toEqual({ ok: false, reason: 'cap' })
    expect(fake.requests).toHaveLength(0)
    expect(await rows('date_ideas')).toHaveLength(1)
  })

  it('under the cap the call runs; once the real cost pushes spend over, the next one stops', async () => {
    await service.from('ai_usage').insert({ couple_id: coupleId, feature: 'pet_note', cost_usd: 0.014, outcome: 'ok' })
    fake.reply(jsonMessage({ word: 'hi' }, { input_tokens: 400, output_tokens: 60 }))
    expect((await call('pet_note')).ok).toBe(true)
    expect(await aiSpendToday(coupleId, 'pet_note')).toBe(0.0154)
    expect(await call('pet_note')).toEqual({ ok: false, reason: 'cap' })
    expect(fake.requests).toHaveLength(1)
  })

  it('parallel calls cannot slip past the cap together, and are told to retry soon', async () => {
    const opts = { system: 'Answer with one word as JSON.', prompt: 'Say hi.', schema: SCHEMA, maxTokens: 1024 }
    // One in-flight call already reserves more than this cap.
    expect(worstCaseUsd(opts)).toBeGreaterThan(AI_DAILY_CAP_USD.samakan_readout)
    fake.always({ ...jsonMessage({ word: 'hi' }, { input_tokens: 400, output_tokens: 60 }), delayMs: 300 })
    const results = await Promise.all(Array.from({ length: 5 }, () => call('samakan_readout')))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    // Not "cap": nothing is spent yet, so the others hear "try again in a moment".
    expect(results.filter((r) => !r.ok && r.reason === 'error' && r.detail === 'busy')).toHaveLength(4)
    expect(fake.requests).toHaveLength(1)
    // The reservation was replaced by the real cost, so the couple can go again.
    expect(await aiSpendToday(coupleId, 'samakan_readout')).toBe(0.0014)
    expect((await call('samakan_readout')).ok).toBe(true)
  })

  it('a pending row older than 5 minutes (a dead request) counts as spent, not in flight', async () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString()
    await service.from('ai_usage').insert({ couple_id: coupleId, feature: 'daily_question', cost_usd: 0.01, outcome: 'pending', created_at: old })
    expect(await call('daily_question')).toEqual({ ok: false, reason: 'cap' })
    expect(fake.requests).toHaveLength(0)
  })

  it('a timeout keeps the worst-case reservation as the logged cost', async () => {
    fake.always({ ...jsonMessage({ word: 'hi' }), delayMs: 1_000 })
    expect(await call('pet_weekly', { timeoutMs: 100 })).toEqual({ ok: false, reason: 'timeout' })
    const [row] = await rows('pet_weekly')
    expect(row.outcome).toBe('timeout')
    expect(Number(row.cost_usd)).toBe(worstCaseUsd({ system: 'Answer with one word as JSON.', prompt: 'Say hi.', schema: SCHEMA, maxTokens: 1024 }))
  })

  it('no couple: logged with couple_id null and never capped', async () => {
    fake.reply(jsonMessage({ word: 'hi' }))
    expect((await call('samakan_set', { coupleId: null })).ok).toBe(true)
    const { data } = await service.from('ai_usage').select('outcome').is('couple_id', null).eq('feature', 'samakan_set').gte('created_at', started)
    expect(data).toEqual([{ outcome: 'ok' }])
  })
})
