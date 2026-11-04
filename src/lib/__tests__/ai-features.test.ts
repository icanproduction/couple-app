// Daily question and Date Ideas on the Claude path: prompts, schemas and
// output checks against a local fake Messages API and a fake ledger. No real
// key, no network beyond 127.0.0.1.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonMessage, message, startFakeAnthropic, type FakeAnthropic } from './helpers/fake-anthropic'
import { createFakeSupabase, hasOp, opArgs, type Query } from './helpers/fake-supabase'
import { IDEAS, IDEA_INPUT, QUESTION_CONTEXT, type SchemaNode } from './helpers/fixtures'

const db = vi.hoisted(() => ({ adminClient: null as unknown }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => { throw new Error('not used') },
  createServiceRoleClient: () => db.adminClient,
}))

import { DAILY_QUESTION_MAX_TOKENS, generateDailyQuestion } from '@/lib/daily-question'
import { DATE_IDEAS_MAX_TOKENS, DateIdeasError, generateDateIdeas, validateIdeas } from '@/lib/date-ideas'

const COUPLE = 'couple-1'
const IDEA_CTX = { todayLabel: 'Tuesday, 27 October 2026', bucketTitles: ['Hike a volcano together'] }

let ledger: Query[] = []
function useLedger() {
  const fake = createFakeSupabase((q) => {
    if (q.table === 'rpc:ai_usage_reserve') return { data: { id: 'usage-1' } }
    if (q.table === 'ai_usage') return {}
    throw new Error(`unexpected ledger query on ${q.table}`)
  })
  db.adminClient = fake.client
  ledger = fake.log
}

let fake: FakeAnthropic
const savedEnv = { ...process.env }
beforeAll(async () => {
  fake = await startFakeAnthropic()
})
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234'
  process.env.ANTHROPIC_BASE_URL = fake.baseUrl
  useLedger()
})
afterEach(() => fake.reset())
afterAll(async () => {
  process.env = savedEnv
  await fake.close()
})

const body = (i = 0) => fake.requests[i].body!
const systemText = (i = 0) => {
  const s = body(i).system
  return typeof s === 'string' ? s : (s ?? []).map((b) => b.text).join('')
}
const reserve = () => opArgs(ledger.find((q) => q.table === 'rpc:ai_usage_reserve')!, 'rpc')?.[0] as Record<string, unknown>

describe('daily question', () => {
  it('returns the question and sends the English prompt, billed to the couple', async () => {
    fake.reply(jsonMessage({ question: '"If you could take a trip together next week, where would you go?"' }))
    const r = await generateDailyQuestion(COUPLE, QUESTION_CONTEXT)
    expect(r).toMatchObject({ ok: true, question: 'If you could take a trip together next week, where would you go?' })

    expect(reserve()).toMatchObject({ p_couple: COUPLE, p_feature: 'daily_question', p_cap: 0.006 })
    expect(body().model).toBe('claude-sonnet-5-5')
    expect(body().max_tokens).toBe(DAILY_QUESTION_MAX_TOKENS)
    expect(body().output_config?.effort).toBe('low')
    // Once per couple per day: no cache write that would never be read.
    expect(typeof body().system).toBe('string')
    expect(systemText()).toContain('Write exactly ONE question in casual, warm English')
    expect(systemText()).toContain('Never write in Indonesian')
    expect(systemText()).not.toContain('—')
    const schema = body().output_config?.format?.schema as SchemaNode
    expect(schema.required).toEqual(['question'])
    expect(schema.properties?.question.type).toBe('string')
    const user = JSON.stringify(body().messages)
    expect(user).toContain('Raka (male, 27 years old, MBTI: INFP)')
    expect(user).toContain('What was the funniest moment of your week?')
  })

  it('tidies dashes out of the question', async () => {
    fake.reply(jsonMessage({ question: 'What would we cook together — if money were no object?' }))
    const r = await generateDailyQuestion(COUPLE, QUESTION_CONTEXT)
    expect(r).toMatchObject({ ok: true, question: 'What would we cook together, if money were no object?' })
  })

  it('a blank question → invalid', async () => {
    fake.reply(jsonMessage({ question: ' "" ' }))
    expect(await generateDailyQuestion(COUPLE, QUESTION_CONTEXT)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('an over-long question → invalid, not cut mid-sentence', async () => {
    fake.reply(jsonMessage({ question: 'a'.repeat(501) }))
    expect(await generateDailyQuestion(COUPLE, QUESTION_CONTEXT)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('no key → no_key, nothing sent', async () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(await generateDailyQuestion(COUPLE, QUESTION_CONTEXT)).toEqual({ ok: false, reason: 'no_key' })
    expect(fake.requests).toHaveLength(0)
    expect(ledger).toHaveLength(0)
  })
})

describe('date ideas', () => {
  it('returns 3 validated ideas from structured output, with the system prompt cached', async () => {
    fake.reply(jsonMessage(IDEAS))
    const r = await generateDateIdeas(COUPLE, IDEA_INPUT, IDEA_CTX)
    expect(r).toMatchObject({ ok: true, ideas: IDEAS.ideas })

    expect(reserve()).toMatchObject({ p_couple: COUPLE, p_feature: 'date_ideas', p_cap: 0.04 })
    expect(body().max_tokens).toBe(DATE_IDEAS_MAX_TOKENS)
    expect(body().output_config?.effort).toBe('low')
    const system = body().system as Array<{ text: string; cache_control?: { type: string } }>
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(systemText()).toContain('Write in relaxed, warm English')
    expect(systemText()).toContain('petualangan (adventure)')
    expect(systemText()).not.toContain('—')

    const format = body().output_config?.format
    expect(format?.type).toBe('json_schema')
    const ideas = (format?.schema as SchemaNode).properties?.ideas
    expect(ideas?.type).toBe('array')
    expect(ideas?.description).toContain('minItems: 3')
    expect(ideas?.items?.additionalProperties).toBe(false)
    expect(ideas?.items?.required).toEqual(['title', 'description', 'estimated_cost_idr', 'category', 'tips'])
    expect(ideas?.items?.properties?.estimated_cost_idr.type).toBe('integer')
    expect(ideas?.items?.properties?.category.enum).toEqual(
      ['petualangan', 'kuliner', 'traveling', 'romantis', 'belajar', 'rumah', 'lainnya'],
    )
    const user = JSON.stringify(body().messages)
    expect(user).toContain('City: Bandung')
    expect(user).toContain('Hike a volcano together')
  })

  const withFirst = (patch: Record<string, unknown>) => ({ ideas: [{ ...IDEAS.ideas[0], ...patch }, ...IDEAS.ideas.slice(1)] })
  const bad: Array<[string, () => ReturnType<typeof message>]> = [
    ['only 2 ideas', () => jsonMessage({ ideas: IDEAS.ideas.slice(0, 2) })],
    ['4 ideas', () => jsonMessage({ ideas: [...IDEAS.ideas, IDEAS.ideas[0]] })],
    ['not JSON', () => message('Sorry, I can\'t help with that.')],
    ['truncated JSON', () => message(JSON.stringify(IDEAS).slice(0, 120), { stopReason: 'max_tokens' })],
    ['unknown category', () => jsonMessage(withFirst({ category: 'olahraga' }))],
    ['fractional cost', () => jsonMessage(withFirst({ estimated_cost_idr: 12.5 }))],
    ['negative cost', () => jsonMessage(withFirst({ estimated_cost_idr: -1 }))],
    ['title over 80 chars', () => jsonMessage(withFirst({ title: 'x'.repeat(81) }))],
    ['blank tips', () => jsonMessage(withFirst({ tips: '   ' }))],
  ]
  it.each(bad)('%s → invalid', async (_label, reply) => {
    fake.reply(reply())
    expect(await generateDateIdeas(COUPLE, IDEA_INPUT, IDEA_CTX)).toMatchObject({ ok: false, reason: 'invalid' })
    // The answer cost money even though it was unusable: it is in the ledger.
    expect(ledger.some((q) => q.table === 'ai_usage' && hasOp(q, 'update'))).toBe(true)
  })

  it('a refusal → refusal, nothing else tried', async () => {
    fake.reply(message('', { stopReason: 'refusal' }))
    expect(await generateDateIdeas(COUPLE, IDEA_INPUT, IDEA_CTX)).toMatchObject({ ok: false, reason: 'refusal' })
    expect(fake.requests).toHaveLength(1)
  })

  it('validateIdeas trims and collapses whitespace', () => {
    const [first] = validateIdeas(withFirst({ title: '  Afternoon   picnic  ' }))
    expect(first.title).toBe('Afternoon picnic')
    expect(() => validateIdeas({ ideas: [] })).toThrow(DateIdeasError)
  })
})
