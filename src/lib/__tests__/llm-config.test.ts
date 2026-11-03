// "Tes koneksi" in Admin → AI against a fake OpenAI-compatible server.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError, chatCompletion, startFakeOpenAI, type FakeOpenAI } from './helpers/fake-openai'
import { createLlm, DEFAULT_LLM_MODEL } from '@/lib/llm'
import { AI_CREDITS_EXHAUSTED, AI_KEY_INVALID } from '@/lib/ai-errors'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => { throw new Error('not used') },
  createServiceRoleClient: () => { throw new Error('not used') },
}))

let fake: FakeOpenAI
beforeAll(async () => { fake = await startFakeOpenAI() })
afterAll(async () => { await fake.close() })
beforeEach(() => fake.reset())

const llmWith = (apiKey: string) =>
  createLlm({ baseUrl: fake.baseUrl, apiKey, model: DEFAULT_LLM_MODEL, maxRetries: 0 })

describe('checkLlmConnection', () => {
  it('ok: one small request with the key and model, reply quoted', async () => {
    const { checkLlmConnection } = await import('@/lib/llm-config')
    fake.reply(chatCompletion('OK'))
    const check = await checkLlmConnection(llmWith('sk-or-test'))
    expect(check.ok).toBe(true)
    expect(check.message).toContain(DEFAULT_LLM_MODEL)
    expect(check.message).toContain('"OK"')
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].headers.authorization).toBe('Bearer sk-or-test')
  })

  it('wrong key → friendly message, no key in it, no retry', async () => {
    const { checkLlmConnection } = await import('@/lib/llm-config')
    fake.always(apiError(401, 'No auth credentials found'))
    const check = await checkLlmConnection(llmWith('sk-or-wrong-key-123'))
    expect(check).toMatchObject({ ok: false, message: AI_KEY_INVALID })
    expect(check.message).not.toContain('sk-or-wrong')
    expect(fake.requests).toHaveLength(1)
  })

  it('no credits → says so', async () => {
    const { checkLlmConnection } = await import('@/lib/llm-config')
    fake.always(apiError(402, 'Insufficient credits'))
    expect(await checkLlmConnection(llmWith('sk-or-test'))).toMatchObject({ ok: false, message: AI_CREDITS_EXHAUSTED })
  })

  it('no key → no network call', async () => {
    const { checkLlmConnection } = await import('@/lib/llm-config')
    const check = await checkLlmConnection(llmWith(''))
    expect(check.ok).toBe(false)
    expect(fake.requests).toHaveLength(0)
  })
})
