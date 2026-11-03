// /api/ai/daily-question and /api/ai/date-ideas end to end: the real route
// handlers and the real env wiring (LLM_BASE_URL / LLM_API_KEY) against a
// fake OpenAI-compatible server, with Supabase replaced by a recording fake.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError, chatCompletion, startFakeOpenAI, type FakeOpenAI } from './helpers/fake-openai'
import { IDEAS, type ChatRequestBody } from './helpers/fixtures'
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

type Handler = (request?: Request) => Promise<Response>
type Routes = { dailyQuestion: Handler; dateIdeas: Handler }

/** Import both routes with the given env, so `llm` is rebuilt from it. */
async function loadRoutes(env: { LLM_BASE_URL?: string; LLM_API_KEY?: string }): Promise<Routes> {
  process.env.LLM_BASE_URL = env.LLM_BASE_URL ?? ''
  process.env.LLM_API_KEY = env.LLM_API_KEY ?? ''
  vi.resetModules()
  const daily = await import('@/app/api/ai/daily-question/route')
  const ideas = await import('@/app/api/ai/date-ideas/route')
  return { dailyQuestion: () => daily.POST(), dateIdeas: (req) => ideas.POST(req as Request) }
}

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
        return { data: [{ question: 'Apa momen paling lucu minggu ini?' }] }
      case 'couple_events':
        return { data: [{ title: 'Ulang tahun Dita', event_date: '2026-11-02' }] }
      case 'bucket_items':
        return { data: [{ title: 'Naik gunung bareng' }] }
      default:
        throw new Error(`unexpected user query on ${q.table}`)
    }
  }
}

type AdminOpts = { quotaFull?: boolean; dbKey?: string; dbModel?: string; dbFails?: boolean }

function adminDb(opts: AdminOpts = {}): (q: Query) => QueryResult {
  return (q) => {
    switch (q.table) {
      // Key/model pasted in Admin → AI (Supabase Vault); none by default.
      case 'rpc:llm_runtime_config':
        return opts.dbFails
          ? { error: { message: 'db down' } }
          : { data: [{ api_key: opts.dbKey ?? null, model: opts.dbModel ?? null }] }
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
/** Everything the route did with the service role besides reading the AI settings. */
const adminWork = () => adminLog.filter((q) => q.table !== 'rpc:llm_runtime_config')

// ---- Tests ------------------------------------------------------------------

let fake: FakeOpenAI
const savedEnv = { ...process.env }
beforeAll(async () => {
  fake = await startFakeOpenAI()
})
afterAll(async () => {
  process.env = savedEnv
  await fake.close()
})
beforeEach(() => {
  fake.reset()
  useDb()
})

describe('without LLM_API_KEY', () => {
  let routes: Routes
  beforeAll(async () => {
    routes = await loadRoutes({ LLM_BASE_URL: 'http://127.0.0.1:9/never' })
  })

  it('daily question → 503 before claiming, no network call', async () => {
    const res = await routes.dailyQuestion()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Fitur AI belum diaktifkan' })
    expect(adminWork()).toHaveLength(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('date ideas → 503 before claiming quota, no network call', async () => {
    const res = await routes.dateIdeas(ideasRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Fitur AI belum diaktifkan' })
    expect(adminWork()).toHaveLength(0)
    expect(fake.requests).toHaveLength(0)
  })

  it('still checks auth and input first', async () => {
    useDb({ signedIn: false })
    expect((await routes.dateIdeas(ideasRequest())).status).toBe(401)
    useDb()
    expect((await routes.dateIdeas(ideasRequest({ budget: 'mahal', vibe: 'santai', setting: 'bebas' }))).status).toBe(400)
  })
})

describe('with LLM_API_KEY (fake OpenRouter)', () => {
  let routes: Routes
  beforeAll(async () => {
    routes = await loadRoutes({ LLM_BASE_URL: fake.baseUrl, LLM_API_KEY: 'sk-or-test' })
  })

  it('daily question: saves the text with the model id in generated_by', async () => {
    fake.reply(chatCompletion('Kalau bisa liburan berdua minggu depan, kalian mau ke mana?'))
    const res = await routes.dailyQuestion()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      question: 'Kalau bisa liburan berdua minggu depan, kalian mau ke mana?',
      alreadyGenerated: false,
    })

    const req = fake.requests[0]
    expect(req.headers.authorization).toBe('Bearer sk-or-test')
    expect((req.body as ChatRequestBody).model).toBe('openai/gpt-6-luna')
    expect((req.body as ChatRequestBody).reasoning_effort).toBe('low')

    const [claim] = adminWrites('ai_daily_questions', 'insert')
    expect(opArgs(claim, 'insert')?.[0]).toMatchObject({ couple_id: COUPLE, question: null, generated_by: USER.id })
    const [save] = adminWrites('ai_daily_questions', 'update')
    expect(opArgs(save, 'update')?.[0]).toMatchObject({
      question: 'Kalau bisa liburan berdua minggu depan, kalian mau ke mana?',
      generated_by: 'openai/gpt-6-luna',
      context_used: { myName: 'Raka', partnerName: 'Dita', myMbti: 'INFP' },
    })
    expect(opArgs(save, 'eq')).toEqual(['id', 'claim-1'])
    expect(adminWrites('ai_daily_questions', 'delete')).toHaveLength(0)
  })

  it('date ideas: returns 3 ideas, marks the run done, sends json_schema', async () => {
    fake.reply(chatCompletion(JSON.stringify(IDEAS)))
    const res = await routes.dateIdeas(ideasRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ runId: 'run-1', ideas: IDEAS.ideas, remaining: 4 })

    const sent = fake.requests[0].body as ChatRequestBody
    expect(sent.model).toBe('openai/gpt-6-luna')
    expect(sent.response_format?.type).toBe('json_schema')
    expect(sent.response_format?.json_schema.strict).toBe(true)

    const [done] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(done, 'update')?.[0]).toEqual({ ideas: IDEAS.ideas, status: 'done' })
  })

  it('date ideas: quota used up → 429 with message, no model call', async () => {
    useDb({ quotaFull: true })
    const res = await routes.dateIdeas(ideasRequest())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Kuota ide hari ini sudah habis, coba lagi besok', remaining: 0 })
    expect(fake.requests).toHaveLength(0)
  })

  it('date ideas: a 2-idea answer → 502 and the quota slot is given back', async () => {
    fake.reply(chatCompletion(JSON.stringify({ ideas: IDEAS.ideas.slice(0, 2) })))
    const res = await routes.dateIdeas(ideasRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Idenya kurang pas, coba minta lagi ya' })
    const [failed] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(failed, 'update')?.[0]).toEqual({ status: 'failed' })
    expect(opArgs(failed, 'eq')).toEqual(['id', 'run-1'])
  })

  it('date ideas: a non-JSON answer → 502', async () => {
    fake.reply(chatCompletion('Maaf, aku tidak bisa membantu itu.'))
    const res = await routes.dateIdeas(ideasRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Idenya kurang pas, coba minta lagi ya' })
  })

  const upstream: Array<[number, number, string, string, number]> = [
    // upstream, status, daily question message, date ideas message, requests (1 + SDK retries)
    [401, 503, 'AI belum dikonfigurasi dengan benar', 'AI belum dikonfigurasi dengan benar', 1],
    [402, 503, 'Kuota AI sedang habis', 'Kuota AI sedang habis', 1],
    [429, 429, 'AI sedang sibuk, coba lagi sebentar', 'AI sedang sibuk, coba lagi sebentar', 3],
    [500, 502, 'Gagal membuat pertanyaan, coba lagi', 'Gagal membuat ide, coba lagi', 3],
  ]

  it.each(upstream)('daily question: upstream %i → %i, claim released', async (code, status, message, _ideas, calls) => {
    fake.always(apiError(code, 'upstream error'))
    const res = await routes.dailyQuestion()
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
    expect(fake.requests).toHaveLength(calls)
    const [release] = adminWrites('ai_daily_questions', 'delete')
    expect(opArgs(release, 'eq')).toEqual(['id', 'claim-1'])
    expect(opArgs(release, 'is')).toEqual(['question', null])
  })

  it.each(upstream)('date ideas: upstream %i → %i, quota slot released', async (code, status, _daily, message, calls) => {
    fake.always(apiError(code, 'upstream error'))
    const res = await routes.dateIdeas(ideasRequest())
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message })
    expect(fake.requests).toHaveLength(calls)
    const [failed] = adminWrites('ai_date_idea_runs', 'update')
    expect(opArgs(failed, 'update')?.[0]).toEqual({ status: 'failed' })
  })
})

describe('key pasted in Admin → AI', () => {
  it('is used when LLM_API_KEY is empty', async () => {
    useDb({ dbKey: 'sk-or-admin' })
    const routes = await loadRoutes({ LLM_BASE_URL: fake.baseUrl, LLM_API_KEY: '' })
    fake.reply(chatCompletion('Apa hal kecil yang bikin kamu senyum hari ini?'))
    const res = await routes.dailyQuestion()
    expect(res.status).toBe(200)
    expect(fake.requests[0].headers.authorization).toBe('Bearer sk-or-admin')
  })

  it('wins over LLM_API_KEY', async () => {
    useDb({ dbKey: 'sk-or-admin' })
    const routes = await loadRoutes({ LLM_BASE_URL: fake.baseUrl, LLM_API_KEY: 'sk-or-env' })
    fake.reply(chatCompletion(JSON.stringify(IDEAS)))
    expect((await routes.dateIdeas(ideasRequest())).status).toBe(200)
    expect(fake.requests[0].headers.authorization).toBe('Bearer sk-or-admin')
  })

  it('a model set there is sent and stored in generated_by', async () => {
    useDb({ dbKey: 'sk-or-admin', dbModel: 'openai/gpt-5.6-luna' })
    const routes = await loadRoutes({ LLM_BASE_URL: fake.baseUrl, LLM_API_KEY: '' })
    fake.reply(chatCompletion('Lagu apa yang paling mengingatkanmu padaku?'))
    expect((await routes.dailyQuestion()).status).toBe(200)
    expect((fake.requests[0].body as ChatRequestBody).model).toBe('openai/gpt-5.6-luna')
    const [save] = adminWrites('ai_daily_questions', 'update')
    expect(opArgs(save, 'update')?.[0]).toMatchObject({ generated_by: 'openai/gpt-5.6-luna' })
  })

  it('a failed settings lookup falls back to LLM_API_KEY', async () => {
    useDb({ dbFails: true })
    const routes = await loadRoutes({ LLM_BASE_URL: fake.baseUrl, LLM_API_KEY: 'sk-or-env' })
    fake.reply(chatCompletion('Kapan terakhir kali kita tertawa sampai sakit perut?'))
    expect((await routes.dailyQuestion()).status).toBe(200)
    expect(fake.requests[0].headers.authorization).toBe('Bearer sk-or-env')
  })

  it('no key anywhere → 503 without a network call', async () => {
    useDb()
    const routes = await loadRoutes({ LLM_BASE_URL: fake.baseUrl, LLM_API_KEY: '' })
    expect((await routes.dateIdeas(ideasRequest())).status).toBe(503)
    expect(fake.requests).toHaveLength(0)
  })
})
