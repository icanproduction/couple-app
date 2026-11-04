// claudeJson and friends (src/lib/claude.ts) against a local fake Messages
// API and a recording fake of the ai_usage ledger: no real key, no network
// beyond 127.0.0.1.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError, jsonMessage, message, startFakeAnthropic, type FakeAnthropic } from './helpers/fake-anthropic'
import { createFakeSupabase, hasOp, opArgs, type Query, type QueryResult } from './helpers/fake-supabase'

const db = vi.hoisted(() => ({ adminClient: null as unknown }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => { throw new Error('not used') },
  createServiceRoleClient: () => db.adminClient,
}))

import {
  AI_DAILY_CAP_USD,
  AI_FEATURES,
  aiSpendToday,
  aiSpendTodayAll,
  checkClaudeConnection,
  claudeConfigured,
  claudeJson,
  claudeKeyLast4,
  costUsd,
  schemaError,
  SONNET,
  toApiSchema,
  worstCaseUsd,
  type ClaudeJsonOptions,
} from '@/lib/claude'
import { aiFailure, AI_BUSY, AI_DAILY_LIMIT, AI_KEY_INVALID, AI_SLOW } from '@/lib/ai-errors'
import { todayJakarta } from '@/lib/dates'

const KEY = 'sk-ant-test-0123456789-WXYZ'
const COUPLE = 'couple-1'

const WORD_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string', maxLength: 10 },
    mood: { type: 'string', enum: ['happy', 'calm'] },
  },
  required: ['word', 'mood'],
  additionalProperties: false,
}

const call = (overrides: Partial<ClaudeJsonOptions> = {}) =>
  claudeJson<{ word: string; mood: string }>({
    feature: 'daily_question',
    coupleId: COUPLE,
    system: 'You answer with one word.',
    prompt: 'Say hi.',
    schema: WORD_SCHEMA,
    maxTokens: 256,
    ...overrides,
  })

// ---- Ledger fake ------------------------------------------------------------

type LedgerOpts = {
  /** What ai_usage_reserve answers. Default: a reservation. */
  reserve?: { id: string } | { blocked: 'cap' | 'busy' } | null
  reserveError?: boolean
  rows?: Array<{ feature?: string; cost_usd: number | string }>
}
let ledger: Query[] = []
function useLedger(opts: LedgerOpts = {}) {
  const resolve = (q: Query): QueryResult => {
    switch (q.table) {
      case 'rpc:ai_usage_reserve':
        return opts.reserveError ? { error: { message: 'db down' } } : { data: opts.reserve === undefined ? { id: 'usage-1' } : opts.reserve }
      case 'ai_usage':
        return hasOp(q, 'select') ? { data: opts.rows ?? [] } : {}
      default:
        throw new Error(`unexpected ledger query on ${q.table}`)
    }
  }
  const fake = createFakeSupabase(resolve)
  db.adminClient = fake.client
  ledger = fake.log
}
const reserveArgs = () => opArgs(ledger.find((q) => q.table === 'rpc:ai_usage_reserve')!, 'rpc')?.[0] as Record<string, unknown>
const settlements = () => ledger.filter((q) => q.table === 'ai_usage' && hasOp(q, 'update'))
const patch = (i = 0) => opArgs(settlements()[i], 'update')?.[0] as Record<string, unknown>

// ---- Setup --------------------------------------------------------------------

let fake: FakeAnthropic
const savedEnv = { ...process.env }
beforeAll(async () => {
  fake = await startFakeAnthropic()
  process.env.ANTHROPIC_BASE_URL = fake.baseUrl
})
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = KEY
  process.env.ANTHROPIC_BASE_URL = fake.baseUrl
  useLedger()
})
afterEach(() => fake.reset())
afterAll(async () => {
  process.env = savedEnv
  await fake.close()
})

// ---- Contract constants ---------------------------------------------------------

describe('constants', () => {
  it('pins Sonnet 5.5 and the per-couple daily caps', () => {
    expect(SONNET).toBe('claude-sonnet-5-5')
    expect(AI_FEATURES).toEqual(['daily_question', 'date_ideas', 'pet_note', 'pet_weekly', 'samakan_set', 'samakan_readout'])
    expect(AI_DAILY_CAP_USD).toEqual({
      daily_question: 0.006,
      date_ideas: 0.04,
      pet_note: 0.015,
      pet_weekly: 0.01,
      samakan_set: 0.02,
      samakan_readout: 0.008,
    })
  })

  it('reads the key from ANTHROPIC_API_KEY only, and shows at most 4 characters', () => {
    expect(claudeConfigured()).toBe(true)
    expect(claudeKeyLast4()).toBe('WXYZ')
    process.env.ANTHROPIC_API_KEY = '   '
    expect(claudeConfigured()).toBe(false)
    expect(claudeKeyLast4()).toBeNull()
    delete process.env.ANTHROPIC_API_KEY
    expect(claudeConfigured()).toBe(false)
  })
})

// ---- claudeJson ---------------------------------------------------------------

describe('claudeJson', () => {
  it('no key → no_key, before the ledger and without a network call', async () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(await call()).toEqual({ ok: false, reason: 'no_key' })
    expect(ledger).toHaveLength(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('cap reached → cap, no network call', async () => {
    useLedger({ reserve: { blocked: 'cap' } })
    expect(await call()).toEqual({ ok: false, reason: 'cap' })
    expect(reserveArgs()).toMatchObject({ p_couple: COUPLE, p_feature: 'daily_question', p_cap: 0.006 })
    expect(reserveArgs().p_estimate).toBeGreaterThan(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('other calls in flight could use the rest → error busy (try again soon), no network call', async () => {
    useLedger({ reserve: { blocked: 'busy' } })
    const r = await call()
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'busy' })
    expect(fake.requests).toHaveLength(0)
    expect(aiFailure(r as never, { retry: 'x' })).toEqual({ status: 429, error: AI_BUSY })
  })

  it('each feature is checked against its own cap', async () => {
    useLedger({ reserve: { blocked: 'cap' } })
    await call({ feature: 'samakan_set' })
    expect(reserveArgs()).toMatchObject({ p_feature: 'samakan_set', p_cap: 0.02 })
  })

  it('ledger down or a malformed answer → error, and no unchecked call', async () => {
    useLedger({ reserveError: true })
    const r = await call()
    expect(r).toMatchObject({ ok: false, reason: 'error' })
    expect(!r.ok && r.detail).toMatch(/usage ledger/)
    useLedger({ reserve: null })
    expect(await call()).toMatchObject({ ok: false, reason: 'error' })
    expect(fake.requests).toHaveLength(0)
  })

  it('no couple → reserved without a cap', async () => {
    fake.reply(jsonMessage({ word: 'hi', mood: 'calm' }))
    expect((await call({ coupleId: null })).ok).toBe(true)
    expect(reserveArgs()).toMatchObject({ p_couple: null, p_cap: null })
  })

  it('rejects a bad feature or maxTokens before reserving', async () => {
    expect(await call({ feature: 'nope' as never })).toMatchObject({ ok: false, reason: 'error' })
    expect(await call({ maxTokens: 0 })).toMatchObject({ ok: false, reason: 'error' })
    expect(await call({ maxTokens: 9000 })).toMatchObject({ ok: false, reason: 'error' })
    const circular: Record<string, unknown> = { type: 'object', properties: {} }
    ;(circular.properties as Record<string, unknown>).self = circular
    const r = await call({ schema: circular })
    expect(r).toMatchObject({ ok: false, reason: 'error' })
    expect(!r.ok && r.detail).toMatch(/bad schema/)
    expect(ledger).toHaveLength(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('success: parsed data, usage with cost, ledger settled with the real numbers', async () => {
    fake.reply(jsonMessage(
      { word: 'hi', mood: 'happy' },
      { input_tokens: 400, output_tokens: 60, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 },
    ))
    const r = await call()
    // 400 × $2 + 1000 × $0.20 + 200 × $2.50 + 60 × $10, per million tokens
    expect(r).toEqual({ ok: true, data: { word: 'hi', mood: 'happy' }, usage: { input: 1600, output: 60, costUsd: 0.0021 } })

    expect(settlements()).toHaveLength(1)
    expect(patch()).toEqual({
      outcome: 'ok',
      input_tokens: 400,
      output_tokens: 60,
      cache_read_tokens: 1000,
      cache_write_tokens: 200,
      cost_usd: 0.0021,
    })
    expect(opArgs(settlements()[0], 'eq')).toEqual(['id', 'usage-1'])
  })

  it('sends Sonnet 5.5, effort low, structured output, the key header, and nothing else', async () => {
    fake.reply(jsonMessage({ word: 'hi', mood: 'calm' }))
    await call()
    expect(fake.requests).toHaveLength(1)
    const req = fake.requests[0]
    expect(req.method).toBe('POST')
    expect(req.path).toBe('/v1/messages')
    // SDK 1.x sends the API key as a bearer token; only the env key is used.
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(req.headers['anthropic-version']).toBeTruthy()
    expect(req.headers['anthropic-beta']).toBeUndefined()

    const body = req.body!
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.max_tokens).toBe(256)
    // Sonnet 5.5 rejects thinking "disabled": the param is left out (adaptive).
    expect(body.thinking).toBeUndefined()
    // Sonnet only: no server-side refusal fallback to another model.
    expect(body.fallbacks).toBeUndefined()
    expect(body.output_config?.effort).toBe('low')
    expect(body.output_config?.format?.type).toBe('json_schema')
    const schema = body.output_config?.format?.schema as Record<string, unknown>
    expect(schema.additionalProperties).toBe(false)
    expect((schema.properties as Record<string, Record<string, unknown>>).mood.enum).toEqual(['happy', 'calm'])
    // maxLength is not enforceable by the API: it moves into the description.
    expect((schema.properties as Record<string, Record<string, unknown>>).word.maxLength).toBeUndefined()
    expect((schema.properties as Record<string, Record<string, unknown>>).word.description).toContain('maxLength: 10')
    expect(body.system).toBe('You answer with one word.')
    expect(body.messages).toEqual([{ role: 'user', content: 'Say hi.' }])
  })

  it('cacheSystem puts a cache breakpoint on the system prompt', async () => {
    fake.reply(jsonMessage({ word: 'hi', mood: 'calm' }))
    await call({ cacheSystem: true })
    expect(fake.requests[0].body?.system).toEqual([
      { type: 'text', text: 'You answer with one word.', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('refusal → soft failure, no other model tried, usage still logged', async () => {
    fake.reply(message('', { stopReason: 'refusal', category: 'general_harms', usage: { input_tokens: 300, output_tokens: 5 } }))
    expect(await call()).toEqual({ ok: false, reason: 'refusal', detail: 'general_harms' })
    expect(fake.requests).toHaveLength(1)
    expect(patch()).toMatchObject({ outcome: 'refusal', input_tokens: 300, output_tokens: 5, cost_usd: 0.00065 })
  })

  const invalid: Array<[string, () => ReturnType<typeof message>, RegExp]> = [
    ['not JSON', () => message('Sorry, I can only say hi.'), /not JSON/],
    ['a missing field', () => jsonMessage({ word: 'hi' }), /mood: missing/],
    ['a wrong type', () => jsonMessage({ word: 7, mood: 'calm' }), /word: expected string/],
    ['a value outside the enum', () => jsonMessage({ word: 'hi', mood: 'sad' }), /mood: not one of/],
    ['an extra field', () => jsonMessage({ word: 'hi', mood: 'calm', extra: 1 }), /extra: not allowed/],
    ['a string over maxLength', () => jsonMessage({ word: 'x'.repeat(11), mood: 'calm' }), /word: longer than 10/],
    ['a cut-off answer', () => message('{"word": "h', { stopReason: 'max_tokens' }), /maxTokens/],
  ]
  it.each(invalid)('%s → invalid, usage logged', async (_label, reply, detail) => {
    fake.reply(reply())
    const r = await call()
    expect(r).toMatchObject({ ok: false, reason: 'invalid' })
    expect(!r.ok && r.detail).toMatch(detail)
    expect(patch()).toMatchObject({ outcome: 'invalid', input_tokens: 400, output_tokens: 60 })
  })

  it('HTTP 401 → error http_401, not retried, logged at zero cost', async () => {
    fake.always(apiError(401, 'authentication_error', 'invalid x-api-key'))
    const r = await call()
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'http_401' })
    expect(fake.requests).toHaveLength(1)
    expect(patch()).toEqual({ outcome: 'error', cost_usd: 0 })
    expect(aiFailure(r as never, { retry: 'x' })).toEqual({ status: 503, error: AI_KEY_INVALID })
  })

  it('HTTP 529 (overloaded) is retried twice, then mapped to busy', async () => {
    fake.always(apiError(529, 'overloaded_error', 'Overloaded'))
    const r = await call()
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'http_529' })
    expect(fake.requests).toHaveLength(3)
    expect(aiFailure(r as never, { retry: 'x' })).toEqual({ status: 429, error: AI_BUSY })
  })

  it('a 500 then a good answer → ok after one retry', async () => {
    fake.reply(apiError(500), jsonMessage({ word: 'hi', mood: 'calm' }))
    expect((await call()).ok).toBe(true)
    expect(fake.requests).toHaveLength(2)
    expect(settlements()).toHaveLength(1)
  })

  it('timeout → timeout, and the reserved cost stays in the ledger', async () => {
    fake.always({ ...jsonMessage({ word: 'hi', mood: 'calm' }), delayMs: 1_000 })
    const r = await call({ timeoutMs: 100 })
    expect(r).toEqual({ ok: false, reason: 'timeout' })
    // No usage numbers: the row keeps its worst-case reservation as the cost.
    expect(patch()).toEqual({ outcome: 'timeout' })
    expect(aiFailure(r as never, { retry: 'x' })).toEqual({ status: 504, error: AI_SLOW })
  })

  it('an unreachable API → error connection, logged at zero cost', async () => {
    const down = await startFakeAnthropic()
    await down.close()
    process.env.ANTHROPIC_BASE_URL = down.baseUrl
    const r = await call()
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'connection' })
    expect(patch()).toEqual({ outcome: 'error', cost_usd: 0 })
  })
})

// ---- Cost ---------------------------------------------------------------------

describe('cost', () => {
  it('prices Sonnet 5.5: $2 in, $10 out, $0.20 cache read, $2.50 / $4 cache write', () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null })).toBe(2)
    expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000, cache_read_input_tokens: null, cache_creation_input_tokens: null, cache_creation: null })).toBe(10)
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0, cache_creation: null })).toBe(0.2)
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_creation: null })).toBe(2.5)
    expect(costUsd({
      input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 },
    })).toBe(4)
  })

  it('the reservation covers a full-length answer', () => {
    const opts = { system: 'x'.repeat(2_000), prompt: 'y'.repeat(1_000), schema: WORD_SCHEMA, maxTokens: 1024 }
    const fullAnswer = costUsd({ input_tokens: 1_000, output_tokens: 1024, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null })
    expect(worstCaseUsd(opts)).toBeGreaterThan(fullAnswer)
  })
})

describe('aiSpendToday', () => {
  it('sums today\'s rows for one couple and feature (Jakarta day)', async () => {
    useLedger({ rows: [{ cost_usd: 0.0021 }, { cost_usd: '0.0013' }] })
    expect(await aiSpendToday(COUPLE, 'date_ideas')).toBe(0.0034)
    const q = ledger[0]
    expect(q.table).toBe('ai_usage')
    const eqs = q.ops.filter((o) => o.method === 'eq').map((o) => o.args)
    expect(eqs).toEqual([['couple_id', COUPLE], ['feature', 'date_ideas'], ['day', todayJakarta()]])
  })

  it('totals every feature for the admin page', async () => {
    useLedger({ rows: [{ feature: 'date_ideas', cost_usd: 0.004 }, { feature: 'date_ideas', cost_usd: 0.002 }, { feature: 'pet_note', cost_usd: 0.001 }] })
    const all = await aiSpendTodayAll()
    expect(all.totalUsd).toBe(0.007)
    expect(all.calls).toBe(3)
    expect(all.byFeature).toMatchObject({ date_ideas: 0.006, pet_note: 0.001, daily_question: 0 })
  })
})

// ---- Schema helpers ---------------------------------------------------------------

describe('toApiSchema', () => {
  it('closes objects, keeps enums, folds unsupported limits into the description, leaves the input alone', () => {
    const input = {
      type: 'object',
      properties: {
        list: { type: 'array', minItems: 3, maxItems: 3, description: 'Three things.', items: { type: 'object', properties: { n: { type: 'integer', minimum: 0 } } } },
        one: { type: 'array', minItems: 1, items: { type: 'string', format: 'date' } },
        pick: { oneOf: [{ type: 'string', enum: ['a'] }, { type: 'null' }] },
      },
      required: ['list'],
    }
    const copy = JSON.parse(JSON.stringify(input))
    const out = toApiSchema(input) as Record<string, never>
    expect(input).toEqual(copy)
    expect(out).toMatchObject({ type: 'object', additionalProperties: false, required: ['list'] })
    const props = out.properties as Record<string, Record<string, unknown>>
    expect(props.list.minItems).toBeUndefined()
    expect(props.list.maxItems).toBeUndefined()
    expect(props.list.description).toBe('Three things.\n\n{minItems: 3, maxItems: 3}')
    expect((props.list.items as Record<string, unknown>).additionalProperties).toBe(false)
    expect(props.one.minItems).toBe(1)
    expect((props.one.items as Record<string, unknown>).format).toBe('date')
    expect(props.pick.anyOf).toEqual([{ type: 'string', enum: ['a'] }, { type: 'null' }])
  })
})

describe('schemaError', () => {
  const schema = {
    type: 'object',
    properties: {
      items: { type: 'array', minItems: 2, items: { type: 'integer', minimum: 1, maximum: 5 } },
      note: { type: ['string', 'null'] },
    },
    required: ['items', 'note'],
    additionalProperties: false,
  }
  it('accepts a fitting value', () => {
    expect(schemaError(schema, { items: [1, 5], note: null })).toBeNull()
    expect(schemaError(schema, { items: [2, 3, 4], note: 'ok' })).toBeNull()
  })
  it('names the first problem', () => {
    expect(schemaError(schema, { items: [1], note: null })).toMatch(/items: fewer than 2/)
    expect(schemaError(schema, { items: [1, 6], note: null })).toMatch(/items\[1\]: above 5/)
    expect(schemaError(schema, { items: [1, 2.5], note: null })).toMatch(/items\[1\]: expected integer/)
    expect(schemaError(schema, { items: [1, 2], note: 3 })).toMatch(/note: expected string or null/)
    expect(schemaError(schema, [])).toMatch(/expected object/)
  })
})

// ---- Admin test ---------------------------------------------------------------

describe('checkClaudeConnection', () => {
  it('one tiny request, outside the ledger', async () => {
    fake.reply(message('OK'))
    const check = await checkClaudeConnection()
    expect(check.ok).toBe(true)
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].body?.model).toBe('claude-sonnet-5-5')
    expect(fake.requests[0].body?.max_tokens).toBeLessThanOrEqual(64)
    expect(ledger).toHaveLength(0)
  })

  it('a rejected key → http_401, no retry', async () => {
    fake.always(apiError(401, 'authentication_error'))
    expect(await checkClaudeConnection()).toMatchObject({ ok: false, reason: 'error', detail: 'http_401' })
    expect(fake.requests).toHaveLength(1)
  })

  it('no key → no request', async () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(await checkClaudeConnection()).toMatchObject({ ok: false, reason: 'no_key' })
    expect(fake.requests).toHaveLength(0)
  })
})

describe('aiFailure', () => {
  it('maps every reason to a calm English message', () => {
    const m = { retry: 'Couldn\'t make a question. Try again.', invalid: 'That came out wrong. Ask again.' }
    expect(aiFailure({ ok: false, reason: 'no_key' }, m)).toEqual({ status: 503, error: 'AI features aren\'t turned on yet' })
    expect(aiFailure({ ok: false, reason: 'cap' }, m)).toEqual({ status: 429, error: AI_DAILY_LIMIT })
    expect(aiFailure({ ok: false, reason: 'cap' }, { ...m, cap: 'Enough for today.' })).toEqual({ status: 429, error: 'Enough for today.' })
    expect(aiFailure({ ok: false, reason: 'refusal' }, m)).toEqual({ status: 502, error: m.retry })
    expect(aiFailure({ ok: false, reason: 'invalid' }, m)).toEqual({ status: 502, error: m.invalid })
    expect(aiFailure({ ok: false, reason: 'invalid' }, { retry: m.retry })).toEqual({ status: 502, error: m.retry })
    expect(aiFailure({ ok: false, reason: 'timeout' }, m)).toEqual({ status: 504, error: AI_SLOW })
    expect(aiFailure({ ok: false, reason: 'error', detail: 'http_500' }, m)).toEqual({ status: 502, error: m.retry })
    expect(aiFailure({ ok: false, reason: 'error', detail: 'http_429' }, m)).toEqual({ status: 429, error: AI_BUSY })
  })
})
