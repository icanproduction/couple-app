// /api/ai/daily-question and /api/ai/date-ideas end to end: the real route
// handlers and the real env wiring (ANTHROPIC_API_KEY) against a local fake
// Messages API, with Supabase replaced by a recording fake.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError, jsonMessage, message, startFakeAnthropic, type FakeAnthropic } from './helpers/fake-anthropic'
import { IDEAS } from './helpers/fixtures'
import { createFakeSupabase, hasOp, opArgs, type Query, type QueryResult } from './helpers/fake-supabase'

const USER = { id: 'user-a' }
const COUPLE = 'couple-1'

const db = vi.hoisted(() => ({
  userClient: null as unknown,
  adminClient: null as unknown,
}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => db.userClient,
  createServiceRoleClient: () => db.adminClient,
}))

import { POST as dailyQuestionPost } from '@/app/api/ai/daily-question/route'
import { POST as dateIdeasPost } from '@/app/api/ai/date-ideas/route'

const dailyQuestion = () => dailyQuestionPost()
const dateIdeas = (req: Request) => dateIdeasPost(req)

// ---- Supabase fakes ---------------------------------------------------------

function userDb(): (q: Query) => QueryResult {
  return (q) => {
    switch (q.table) {
      case 'couple_members':
        return hasOp(q, 'neq') ? { data: [{ profile_id: 'user-b' }] } : { data: { couple_id: COUPLE } }
      case 'profiles':
        return opArgs(q, 'eq')?.[1] === USER.id
          ? { data: { name: 'Raka', gender: 'male', birthday: '1999-03-01', relationship_start_date: '2025-08-01' } }
          : { data: { name: 'Dita', gender: 'female', birthday: '2000-05-02', relationship_start_date: null } }
      case 'mbti_results':
        return { data: opArgs(q, 'eq')?.[1] === USER.id ? { mbti_type: 'INFP' } : null }
      case 'ai_daily_questions':
        return { data: [{ question: 'What was the funniest moment of your week?' }] }
      case 'couple_events':
        return { data: [{ title: "Dita's birthday", event_date: '2026-11-02' }] }
      case 'bucket_items':
        return { data: [{ title: 'Hike a volcano together' }] }
      default:
        throw new Error(`unexpected user query on ${q.table}`)
    }
  }
}

type AdminOpts = { quotaFull?: boolean; capReached?: boolean }

function adminDb(opts: AdminOpts = {}): (q: Query) => QueryResult {
  return (q) => {
    switch (q.table) {
      case 'rpc:ai_usage_reserve':
        return { data: opts.capReached ? { blocked: 'cap' } : { id: 'usage-1' } }
      case 'ai_usage':
        return {}
      case 'ai_daily_questions':
        return hasOp(q, 'insert') ? { data: { id: 'claim-1' } } : {}
      case 'rpc:claim_date_idea_run':
        return { data: opts.quotaFull ? null : 'run-1' }
      case 'ai_date_idea_runs':
        return hasOp(q, 'select') ? { count: 1 } : {}
      default:
        throw new Error(`unexpected admin query on ${q.table}`)
    }
  }
}

let adminLog: Query[] = []
function useDb(opts: AdminOpts & { signedIn?: boolean } = {}) {
  const user = createFakeSupabase(userDb(), opts.signedIn === false ? null : USER)
  const admin = createFakeSupabase(adminDb(opts))
  db.userClient = user.client
  db.adminClient = admin.client
  adminLog = admin.log
}

const ideasRequest = (body: unknown = { budget: 'hemat', vibe: 'santai', setting: 'bebas', city: 'Bandung' }) =>
  new Request('http://localhost/api/ai/date-ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const adminWrites = (table: string, method: string) =>
  adminLog.filter((q) => q.table === table && hasOp(q, method))

// ---- Tests ------------------------------------------------------------------

let fake: FakeAnthropic
const savedEnv = { ...process.env }
beforeAll(async () => {
  fake = await startFakeAnthropic()
})
afterAll(async () => {
  process.env = savedEnv
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  process.env.ANTHROPIC_BASE_URL = fake.baseUrl
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234'
  useDb()
})

describe('without ANTHROPIC_API_KEY', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('daily question → 503 before claiming, no network call', async () => {
    const res = await dailyQuestion()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'AI features aren\'t turned on yet' })
    expect(adminLog).toHaveLength(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('date ideas → 503 before claiming quota, no network call', async () => {
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'AI features aren\'t turned on yet' })
    expect(adminLog).toHaveLength(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('still checks auth and input first', async () => {
    useDb({ signedIn: false })
    expect((await dateIdeas(ideasRequest())).status).toBe(401)
    useDb()
    expect((await dateIdeas(ideasRequest({ budget: 'mahal', vibe: 'santai', setting: 'bebas' }))).status).toBe(400)
  })
})

describe('with ANTHROPIC_API_KEY (fake Messages API)', () => {
  it('daily question: saves the text with the model id in generated_by, usage settled', async () => {
    fake.reply(jsonMessage({ question: 'If you could take a trip together next week, where would you go?' }))
    const res = await dailyQuestion()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      question: 'If you could take a trip together next week, where would you go?',
      alreadyGenerated: false,
    })

    expect(fake.requests[0].headers.authorization).toBe('Bearer sk-ant-test-key-1234')
    expect(fake.requests[0].body?.model).toBe('claude-sonnet-5-5')

    const [claim] = adminWrites('ai_daily_questions', 'insert')
    expect(opArgs(claim, 'insert')?.[0]).toMatchObject({ couple_id: COUPLE, question: null, generated_by: USER.id })
    const [save] = adminWrites('ai_daily_questions', 'update')
    expect(opArgs(save, 'update')?.[0]).toMatchObject({
      question: 'If you could take a trip together next week, where would you go?',
      generated_by: 'claude-sonnet-5-5',
      context_used: { myName: 'Raka', partnerName: 'Dita', myMbti: 'INFP' },
    })
    expect(opArgs(save, 'eq')).toEqual(['id', 'claim-1'])
    expect(adminWrites('ai_daily_questions', 'delete')).toHaveLength(0)
    expect(adminWrites('ai_usage', 'update')).toHaveLength(1)
  })

  it('daily question: cap reached → 429 calm message, claim released, no model call', async () => {
    useDb({ capReached: true })
    const res = await dailyQuestion()
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'You\'ve reached today\'s AI limit for this. Try again tomorrow.' })
    expect(fake.requests).toHaveLength(0)
    const [release] = adminWrites('ai_daily_questions', 'delete')
    expect(opArgs(release, 'eq')).toEqual(['id', 'claim-1'])
  })

  it('daily question: refusal → calm retry message, claim released', async () => {
    fake.reply(message('', { stopReason: 'refusal' }))
    const res = await dailyQuestion()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Couldn\'t make a question. Try again.' })
    expect(adminWrites('ai_daily_questions', 'delete')).toHaveLength(1)
  })

  it('date ideas: returns 3 ideas, marks the run done', async () => {
    fake.reply(jsonMessage(IDEAS))
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ runId: 'run-1', ideas: IDEAS.ideas, remaining: 4 })
    expect(fake.requests[0].body?.output_config?.format?.type).toBe('json_schema')
    const [done] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(done, 'update')?.[0]).toEqual({ ideas: IDEAS.ideas, status: 'done' })
  })

  it('date ideas: quota used up → 429 with message, no model call', async () => {
    useDb({ quotaFull: true })
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'You\'ve used up today\'s ideas. Try again tomorrow.', remaining: 0 })
    expect(fake.requests).toHaveLength(0)
  })

  it('date ideas: cap reached → 429 calm message and the quota slot is given back', async () => {
    useDb({ capReached: true })
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'You\'ve reached today\'s AI limit for this. Try again tomorrow.' })
    expect(fake.requests).toHaveLength(0)
    const [failed] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(failed, 'update')?.[0]).toEqual({ status: 'failed' })
  })

  it('date ideas: a 2-idea answer → 502 and the quota slot is given back', async () => {
    fake.reply(jsonMessage({ ideas: IDEAS.ideas.slice(0, 2) }))
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Those ideas didn\'t come out right. Ask again.' })
    const [failed] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(failed, 'update')?.[0]).toEqual({ status: 'failed' })
    expect(opArgs(failed, 'eq')).toEqual(['id', 'run-1'])
  })

  it('date ideas: a non-JSON answer → 502', async () => {
    fake.reply(message('Sorry, I can\'t help with that.'))
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Those ideas didn\'t come out right. Ask again.' })
  })

  const upstream: Array<[number, number, string, string, number]> = [
    // upstream, status, daily question message, date ideas message, requests (1 + SDK retries)
    [401, 503, 'The AI isn\'t set up correctly yet', 'The AI isn\'t set up correctly yet', 1],
    [429, 429, 'The AI is busy. Try again in a moment.', 'The AI is busy. Try again in a moment.', 3],
    [529, 429, 'The AI is busy. Try again in a moment.', 'The AI is busy. Try again in a moment.', 3],
    [500, 502, 'Couldn\'t make a question. Try again.', 'Couldn\'t make ideas. Try again.', 3],
  ]

  it.each(upstream)('daily question: upstream %i → %i, claim released', async (code, status, msg, _ideas, calls) => {
    fake.always(apiError(code))
    const res = await dailyQuestion()
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: msg })
    expect(fake.requests).toHaveLength(calls)
    const [release] = adminWrites('ai_daily_questions', 'delete')
    expect(opArgs(release, 'eq')).toEqual(['id', 'claim-1'])
    expect(opArgs(release, 'is')).toEqual(['question', null])
  })

  it.each(upstream)('date ideas: upstream %i → %i, quota slot released', async (code, status, _daily, msg, calls) => {
    fake.always(apiError(code))
    const res = await dateIdeas(ideasRequest())
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: msg })
    expect(fake.requests).toHaveLength(calls)
    const [failed] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(failed, 'update')?.[0]).toEqual({ status: 'failed' })
  })
})
