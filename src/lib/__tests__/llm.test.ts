// AI features against a local fake OpenAI-compatible server: no real key,
// no network beyond 127.0.0.1.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiError, chatCompletion, startFakeOpenAI, type FakeOpenAI } from './helpers/fake-openai'
import { IDEAS, IDEA_INPUT, QUESTION_CONTEXT, type ChatRequestBody } from './helpers/fixtures'
import { createLlm, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, LlmNotConfiguredError, type LlmSettings } from '@/lib/llm'
import { AI_NOT_CONFIGURED, providerFailure } from '@/lib/ai-errors'
import { generateDailyQuestion } from '@/lib/daily-question'
import { DateIdeasError, generateDateIdeas, validateIdeas } from '@/lib/date-ideas'

const IDEA_CTX = { todayLabel: 'Tuesday, 27 October 2026', bucketTitles: ['Hike a volcano together'] }

let fake: FakeOpenAI
const llmFor = (overrides: Partial<LlmSettings> = {}) =>
  createLlm({ baseUrl: fake.baseUrl, apiKey: 'test-key', model: DEFAULT_LLM_MODEL, maxRetries: 0, ...overrides })
const body = (i = 0) => fake.requests[i].body as ChatRequestBody

beforeAll(async () => {
  fake = await startFakeOpenAI()
})
afterEach(() => fake.reset())
afterAll(() => fake.close())

describe('wiring (src/lib/llm.ts)', () => {
  it('defaults to OpenRouter and the pinned GPT Luna id', () => {
    expect(DEFAULT_LLM_BASE_URL).toBe('https://openrouter.ai/api/v1')
    expect(DEFAULT_LLM_MODEL).toBe('openai/gpt-6-luna')
    const l = createLlm({ baseUrl: '', apiKey: '', model: '' })
    expect(l.modelId).toBe('openai/gpt-6-luna')
    expect(l.configured).toBe(false)
    expect(l.maxRetries).toBe(2)
  })

  it('treats a whitespace key as missing', () => {
    expect(createLlm({ baseUrl: '', apiKey: '   ', model: DEFAULT_LLM_MODEL }).configured).toBe(false)
    expect(createLlm({ baseUrl: '', apiKey: 'sk-or-x', model: DEFAULT_LLM_MODEL }).configured).toBe(true)
  })

  it('builds the default instance from LLM_* env vars', async () => {
    const saved = { ...process.env }
    try {
      delete process.env.LLM_API_KEY
      delete process.env.LLM_MODEL_SYNTHESIS
      vi.resetModules()
      const unset = (await import('@/lib/llm')).llm
      expect(unset.configured).toBe(false)
      expect(unset.modelId).toBe('openai/gpt-6-luna')

      process.env.LLM_API_KEY = 'sk-or-test'
      process.env.LLM_MODEL_SYNTHESIS = 'openai/gpt-6-luna-mini'
      vi.resetModules()
      const set = (await import('@/lib/llm')).llm
      expect(set.configured).toBe(true)
      expect(set.modelId).toBe('openai/gpt-6-luna-mini')
    } finally {
      process.env = saved
      vi.resetModules()
    }
  })
})

describe('daily question', () => {
  it('returns the model text and sends GPT Luna with low reasoning effort', async () => {
    fake.reply(chatCompletion('"If you could take a trip together next week, where would you go?"'))
    const q = await generateDailyQuestion(llmFor(), QUESTION_CONTEXT)
    expect(q).toBe('If you could take a trip together next week, where would you go?')

    expect(fake.requests).toHaveLength(1)
    const req = fake.requests[0]
    expect(req.method).toBe('POST')
    expect(req.path).toBe('/api/v1/chat/completions')
    expect(req.headers.authorization).toBe('Bearer test-key')
    expect(body().model).toBe('openai/gpt-6-luna')
    expect(body().reasoning_effort).toBe('low')
    expect(body().response_format).toBeUndefined()
    const messages = body().messages ?? []
    expect(messages[0].role).toBe('system')
    expect(String(messages[0].content)).toContain('Write exactly ONE question in casual, warm English')
    expect(String(messages[0].content)).toContain('Never write in Indonesian')
    expect(String(messages[0].content)).not.toContain('\u2014')
    const user = JSON.stringify(messages[1].content)
    expect(user).toContain('Raka (male, 27 years old, MBTI: INFP)')
    expect(user).toContain('What was the funniest moment of your week?')
  })

  it('rejects an empty answer', async () => {
    fake.reply(chatCompletion('   '))
    await expect(generateDailyQuestion(llmFor(), QUESTION_CONTEXT)).rejects.toThrow(/empty response/)
  })

  it('caps the question at 500 characters', async () => {
    fake.reply(chatCompletion('a'.repeat(900)))
    expect(await generateDailyQuestion(llmFor(), QUESTION_CONTEXT)).toHaveLength(500)
  })
})

describe('date ideas', () => {
  it('returns 3 validated ideas from a strict json_schema response', async () => {
    fake.reply(chatCompletion(JSON.stringify(IDEAS)))
    const ideas = await generateDateIdeas(llmFor(), IDEA_INPUT, IDEA_CTX)
    expect(ideas).toEqual(IDEAS.ideas)

    expect(body().model).toBe('openai/gpt-6-luna')
    expect(body().reasoning_effort).toBe('medium')
    const format = body().response_format
    expect(format?.type).toBe('json_schema')
    expect(format?.json_schema.strict).toBe(true)
    expect(format?.json_schema.name).toBe('date_ideas')
    const ideasSchema = format?.json_schema.schema.properties?.ideas
    expect(ideasSchema?.minItems).toBe(3)
    expect(ideasSchema?.maxItems).toBe(3)
    expect(ideasSchema?.items?.additionalProperties).toBe(false)
    expect(ideasSchema?.items?.required).toEqual(['title', 'description', 'estimated_cost_idr', 'category', 'tips'])
    expect(ideasSchema?.items?.properties?.estimated_cost_idr.type).toBe('integer')
    expect(ideasSchema?.items?.properties?.estimated_cost_idr.minimum).toBe(0)
    expect(ideasSchema?.items?.properties?.category.enum).toEqual(
      ['petualangan', 'kuliner', 'traveling', 'romantis', 'belajar', 'rumah', 'lainnya'],
    )
    const user = JSON.stringify((body().messages ?? [])[1].content)
    expect(user).toContain('City: Bandung')
    expect(user).toContain('Hike a volcano together')
    const system = String((body().messages ?? [])[0].content)
    expect(system).toContain('Write in relaxed, warm English')
    expect(system).toContain('petualangan (adventure)')
    expect(system).not.toContain('\u2014')
  })

  const withFirst = (patch: Record<string, unknown>) =>
    JSON.stringify({ ideas: [{ ...IDEAS.ideas[0], ...patch }, ...IDEAS.ideas.slice(1)] })
  const bad: Array<[string, string]> = [
    ['only 2 ideas', JSON.stringify({ ideas: IDEAS.ideas.slice(0, 2) })],
    ['4 ideas', JSON.stringify({ ideas: [...IDEAS.ideas, IDEAS.ideas[0]] })],
    ['not JSON', 'Sorry, I can\'t help with that.'],
    ['truncated JSON', JSON.stringify(IDEAS).slice(0, 120)],
    ['unknown category', withFirst({ category: 'olahraga' })],
    ['fractional cost', withFirst({ estimated_cost_idr: 12.5 })],
    ['negative cost', withFirst({ estimated_cost_idr: -1 })],
    ['title over 80 chars', withFirst({ title: 'x'.repeat(81) })],
    ['blank tips', withFirst({ tips: '   ' })],
  ]
  it.each(bad)('rejects %s with DateIdeasError', async (_label, content) => {
    fake.reply(chatCompletion(content))
    await expect(generateDateIdeas(llmFor(), IDEA_INPUT, IDEA_CTX)).rejects.toBeInstanceOf(DateIdeasError)
  })

  it('validateIdeas trims and collapses whitespace', () => {
    const [first] = validateIdeas(JSON.parse(withFirst({ title: '  Afternoon   picnic  ' })))
    expect(first.title).toBe('Afternoon picnic')
  })
})

describe('missing key', () => {
  it('throws before any network call, and maps to 503', async () => {
    const off = llmFor({ apiKey: '' })
    const errors = await Promise.all([
      generateDailyQuestion(off, QUESTION_CONTEXT).catch((e: unknown) => e),
      generateDateIdeas(off, IDEA_INPUT, IDEA_CTX).catch((e: unknown) => e),
    ])
    for (const e of errors) {
      expect(e).toBeInstanceOf(LlmNotConfiguredError)
      expect(providerFailure(e, 'x')).toEqual({ status: 503, error: 'AI features aren\'t turned on yet' })
    }
    expect(AI_NOT_CONFIGURED.error).toBe('AI features aren\'t turned on yet')
    expect(fake.requests).toHaveLength(0)
  })
})

describe('provider errors → status and message', () => {
  const cases: Array<[number, number, string]> = [
    [401, 503, 'The AI isn\'t set up correctly yet'],
    [403, 503, 'The AI isn\'t set up correctly yet'],
    [402, 503, 'The AI has run out of credits for now'],
    [429, 429, 'The AI is busy. Try again in a moment.'],
    [500, 502, 'Something went wrong. Try again.'],
    [503, 502, 'Something went wrong. Try again.'],
    [400, 502, 'Something went wrong. Try again.'],
  ]
  it.each(cases)('HTTP %i → %i', async (upstream, status, error) => {
    fake.always(apiError(upstream, 'upstream says no'))
    const e = await generateDailyQuestion(llmFor(), QUESTION_CONTEXT).catch((x: unknown) => x)
    expect(providerFailure(e, 'Something went wrong. Try again.')).toEqual({ status, error })
  })

  it('unwraps the RetryError after retries (429 retried, then mapped)', async () => {
    fake.always(apiError(429, 'rate limited'))
    const e = await generateDateIdeas(llmFor({ maxRetries: 2 }), IDEA_INPUT, IDEA_CTX).catch((x: unknown) => x)
    expect(fake.requests).toHaveLength(3)
    expect(providerFailure(e, 'x')).toEqual({ status: 429, error: 'The AI is busy. Try again in a moment.' })
  })

  it('does not retry a 402', async () => {
    fake.always(apiError(402, 'Insufficient credits'))
    const e = await generateDateIdeas(llmFor({ maxRetries: 2 }), IDEA_INPUT, IDEA_CTX).catch((x: unknown) => x)
    expect(fake.requests).toHaveLength(1)
    expect(providerFailure(e, 'x')).toEqual({ status: 503, error: 'The AI has run out of credits for now' })
  })

  it('maps a timeout to 502', async () => {
    fake.reply({ ...chatCompletion('too late'), delayMs: 1_000 })
    const e = await generateDailyQuestion(llmFor(), QUESTION_CONTEXT, { timeoutMs: 50 }).catch((x: unknown) => x)
    expect(providerFailure(e, 'Something went wrong. Try again.')).toEqual({ status: 502, error: 'Something went wrong. Try again.' })
  })

  it('maps an unreachable server to 502', async () => {
    const down = await startFakeOpenAI()
    const baseUrl = down.baseUrl
    await down.close()
    const e = await generateDailyQuestion(llmFor({ baseUrl }), QUESTION_CONTEXT).catch((x: unknown) => x)
    expect(providerFailure(e, 'Something went wrong. Try again.')).toEqual({ status: 502, error: 'Something went wrong. Try again.' })
  })

  it('leaves non-provider errors to the caller', () => {
    expect(providerFailure(new Error('db down'), 'x')).toBeNull()
    expect(providerFailure(new DateIdeasError('bad'), 'x')).toBeNull()
  })
})
