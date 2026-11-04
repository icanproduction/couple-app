// /api/admin/llm (Admin → AI): admin-only Claude status and Test connection,
// against a local fake Messages API and recording Supabase fakes.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { apiError, message, startFakeAnthropic, type FakeAnthropic } from './helpers/fake-anthropic'
import { createFakeSupabase, type Query } from './helpers/fake-supabase'

const db = vi.hoisted(() => ({ userClient: null as unknown, adminClient: null as unknown }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => db.userClient,
  createServiceRoleClient: () => db.adminClient,
}))

import * as route from '@/app/api/admin/llm/route'

const KEY = 'sk-ant-api03-secret-value-abcdefghijkl-9Q7x'

let ledger: Query[] = []
function useDb({ signedIn = true, admin = true } = {}) {
  db.userClient = createFakeSupabase((q) => {
    if (q.table === 'rpc:is_admin') return { data: admin }
    throw new Error(`unexpected user query on ${q.table}`)
  }, signedIn ? { id: 'admin-1' } : null).client
  const fake = createFakeSupabase((q) => {
    if (q.table === 'ai_usage') return { data: [{ feature: 'date_ideas', cost_usd: 0.0084 }, { feature: 'daily_question', cost_usd: '0.0024' }] }
    throw new Error(`unexpected service query on ${q.table}`)
  })
  db.adminClient = fake.client
  ledger = fake.log
}

const post = (body: unknown) => new NextRequest('http://localhost/api/admin/llm', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

let fake: FakeAnthropic
const savedEnv = { ...process.env }
beforeAll(async () => { fake = await startFakeAnthropic() })
afterAll(async () => {
  process.env = savedEnv
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  process.env.ANTHROPIC_API_KEY = KEY
  process.env.ANTHROPIC_BASE_URL = fake.baseUrl
  useDb()
})

describe('GET /api/admin/llm', () => {
  it('signed out → 401, non-admin → 403', async () => {
    useDb({ signedIn: false })
    expect((await route.GET()).status).toBe(401)
    useDb({ admin: false })
    expect((await route.GET()).status).toBe(403)
    expect(ledger).toHaveLength(0)
  })

  it('admin: status with the last 4 only, fixed model, today\'s spend and caps', async () => {
    const res = await route.GET()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(KEY)
    expect(text).not.toContain(KEY.slice(0, 12))
    const json = JSON.parse(text)
    expect(json).toMatchObject({
      configured: true,
      key_source: 'env',
      key_last4: '9Q7x',
      model: 'claude-sonnet-5-5',
      model_label: 'Claude Sonnet 5.5',
      spend_today_usd: 0.0108,
      calls_today: 2,
      caps_usd: { daily_question: 0.006, date_ideas: 0.04 },
    })
    expect(json.spend_by_feature).toMatchObject({ date_ideas: 0.0084, daily_question: 0.0024, pet_note: 0 })
    expect(fake.requests).toHaveLength(0)
  })

  it('no key → configured false, key_last4 null', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const json = await (await route.GET()).json()
    expect(json).toMatchObject({ configured: false, key_last4: null })
  })

  it('the key editing handlers are gone', () => {
    expect('PUT' in route).toBe(false)
    expect('DELETE' in route).toBe(false)
  })
})

describe('POST /api/admin/llm { action: "test" }', () => {
  it('non-admin → 403 without a call', async () => {
    useDb({ admin: false })
    expect((await route.POST(post({ action: 'test' }))).status).toBe(403)
    expect(fake.requests).toHaveLength(0)
  })

  it('unknown action → 400', async () => {
    expect((await route.POST(post({ action: 'nope' }))).status).toBe(400)
  })

  it('ok: one tiny Sonnet request, key not echoed', async () => {
    fake.reply(message('OK'))
    const res = await route.POST(post({ action: 'test' }))
    const text = await res.text()
    expect(text).not.toContain(KEY.slice(0, 12))
    const json = JSON.parse(text)
    expect(json.check.ok).toBe(true)
    expect(json.check.message).toMatch(/^Connected to Claude Sonnet 5\.5 \(\d+\.\d s\)\.$/)
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].body?.max_tokens).toBeLessThanOrEqual(64)
  })

  it('a rejected key → friendly message', async () => {
    fake.always(apiError(401, 'authentication_error', `invalid x-api-key ${KEY}`))
    const json = await (await route.POST(post({ action: 'test' }))).json()
    expect(json.check).toMatchObject({ ok: false, message: 'The AI isn\'t set up correctly yet' })
    expect(JSON.stringify(json)).not.toContain(KEY.slice(0, 12))
  })

  it('no key → says so, no request', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const json = await (await route.POST(post({ action: 'test' }))).json()
    expect(json.check).toMatchObject({ ok: false, message: 'No API key yet. Set ANTHROPIC_API_KEY on the server, then redeploy.' })
    expect(fake.requests).toHaveLength(0)
  })
})
