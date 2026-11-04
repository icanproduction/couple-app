// Pet Kita's daily note (src/lib/pet-ai.ts), /api/pet/today, the Monday note
// inside /api/cron/event-reminders, the adoption push, push kind 'pet' and the
// account export's pet and Samakan parts. Spec 2026-11-04-pet-remake.md gates
// 17-22 and 25 (server side).
//
// The Claude layer (@/lib/claude) is mocked: no network. Supabase is the
// recording fake from ./helpers. One opt-in live call: PET_LIVE=1 (local
// Supabase + ANTHROPIC_API_KEY) runs only the last block, at most 300 output
// tokens, and prints the measured usage (also appended to the file PET_LIVE_OUT).
// PET_DB=1 runs the local-database block instead: real claim RPC, note
// constraints, ledger and RLS, with claudeJson against the local fake
// Messages API (never the network).
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, hasOp, opArgs, type Query, type QueryResult } from './helpers/fake-supabase'
import { jsonMessage, startFakeAnthropic, type FakeAnthropic } from './helpers/fake-anthropic'
import { todayJakarta } from '@/lib/dates'
import type { PetStatus } from '@/types/pet'

const LIVE = process.env.PET_LIVE === '1'
/** PET_DB=1: real claudeJson and the local database, Messages API faked on 127.0.0.1. */
const DB = process.env.PET_DB === '1'
const REAL = LIVE || DB

const h = vi.hoisted(() => ({
  configured: true,
  calls: [] as Array<Record<string, unknown>>,
  replies: [] as unknown[],
  delayMs: 0,
  userClient: null as unknown,
  adminClient: null as unknown,
  pushes: [] as Array<{ profileId: string; payload: { title: string; body: string; url: string }; kind: unknown; options: unknown }>,
}))

vi.mock('@/lib/supabase-server', async () => {
  if (process.env.PET_LIVE === '1' || process.env.PET_DB === '1') {
    const { createClient } = await import('@supabase/supabase-js')
    return {
      // The signed-in user's session: a real local client the DB tests set.
      createServerSupabaseClient: async () => h.userClient,
      createServiceRoleClient: () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    }
  }
  return {
    createServerSupabaseClient: async () => h.userClient,
    createServiceRoleClient: () => h.adminClient,
  }
})

vi.mock('@/lib/claude', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/claude')>()
  if (process.env.PET_LIVE === '1' || process.env.PET_DB === '1') return real
  return {
    ...real,
    claudeConfigured: () => h.configured,
    claudeJson: async (opts: Record<string, unknown>) => {
      h.calls.push(opts)
      if (h.delayMs) await new Promise((resolve) => setTimeout(resolve, h.delayMs))
      return h.replies.shift() ?? { ok: false, reason: 'error', detail: 'no reply queued' }
    },
  }
})

vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }))

vi.mock('@/lib/push-server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/push-server')>()
  return {
    ...real,
    sendPushToProfile: async (profileId: string, payload: { title: string; body: string; url: string }, kind?: unknown, options?: unknown) => {
      h.pushes.push({ profileId, payload, kind, options })
      return { sent: 1, failed: 0, stale: 0 }
    },
  }
})

import {
  ALL_TEMPLATE_LINES,
  DIGEST_READS,
  PET_NOTE_MAX_TOKENS,
  PET_NOTE_SCHEMA,
  PET_NOTE_SYSTEM,
  buildPetDigest,
  generatePetNote,
  loadDigestSource,
  noteKindFor,
  noteProblem,
  resolvePetNote,
  templateNote,
  type PetDigest,
} from '@/lib/pet-ai'
import { GET as todayGet } from '@/app/api/pet/today/route'
import { GET as cronGet } from '@/app/api/cron/event-reminders/route'
import { POST as adoptPost } from '@/app/api/pet/adopt/route'
import { GET as exportGet } from '@/app/api/account/export/route'
import { isPushKind, PUSH_KINDS, SERVER_ONLY_PUSH_KINDS } from '@/lib/push-server'
import { isPushMuted, type MutePrefs } from '@/lib/quiet-hours'

// ---- Fixtures ---------------------------------------------------------------

const COUPLE = 'couple-1'
const PET = 'pet-1'
const ME = 'user-a'
const PARTNER = 'user-b'
/** Thursday 5 November 2026, 10:00 WIB. */
const THURSDAY = new Date('2026-11-05T03:00:00Z')
/** Monday 9 November 2026, 07:00 WIB: when the cron runs. */
const MONDAY = new Date('2026-11-09T00:00:00Z')
const HOUR = 3600_000

const SENTINEL = {
  letter: 'SENTINEL-LETTER-BODY',
  jar: 'SENTINEL-JAR-NOTE',
  answer: 'SENTINEL-DAILY-ANSWER',
  comment: 'SENTINEL-COMMENT-BODY',
  moodNote: 'SENTINEL-MOOD-NOTE',
  momentText: 'SENTINEL-MOMENT-DESCRIPTION',
  eventText: 'SENTINEL-EVENT-DESCRIPTION',
  bucketNote: 'SENTINEL-BUCKET-NOTE',
  readout: 'SENTINEL-SAMAKAN-READOUT',
  samakanPrompt: 'SENTINEL-SAMAKAN-PROMPT',
}
const AMOUNT = 7654321

function status(over: Partial<PetStatus> = {}): PetStatus {
  return {
    pet_id: PET, couple_id: COUPLE, name: 'Mochi', pet_type: 'cat', created_at: '2026-10-01T00:00:00Z',
    level: 6, xp: 560, into_level: 60, xp_per_level: 100, stage: 'growing', mood: 'cozy', warmth_72h: 20,
    comfort_for: [], said_hi_today: [{ profile_id: PARTNER, gesture: 'snack', at: '2026-11-05T01:12:00Z' }],
    both_today: false, hatched: true, hatched_at: '2026-10-01T00:00:00Z', migrated: false, night: false,
    day: '2026-11-05', ...over,
  }
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString()
const eqArg = (q: Query, column: string) => q.ops.find((o) => o.method === 'eq' && o.args[0] === column)?.args[1]

/** The couple's data as a careless select('*') would return it: every text field carries a sentinel. */
function coupleData(now: Date) {
  return (q: Query): QueryResult | undefined => {
    switch (q.table) {
      case 'couple_members':
        return { data: [{ profile_id: ME, couple_id: COUPLE }, { profile_id: PARTNER, couple_id: COUPLE }] }
      case 'profiles':
        return { data: [{ id: ME, name: 'Raka Pratama', birthday: '1999-01-01' }, { id: PARTNER, name: 'Dita', birthday: '2000-01-01' }] }
      case 'pet_warmth_events':
        return {
          data: [
            { source: 'moment', points: 10, created_at: ago(now, 2 * HOUR), ref_id: 'm1', actor_id: PARTNER },
            { source: 'kangen', points: 3, created_at: ago(now, 3 * HOUR), actor_id: ME },
            { source: 'kangen', points: 3, created_at: ago(now, 30 * HOUR), actor_id: PARTNER },
            { source: 'letter', points: 8, created_at: ago(now, 50 * HOUR), actor_id: ME },
            { source: 'jar', points: 5, created_at: ago(now, 60 * HOUR), actor_id: ME },
            { source: 'daily', points: 4, created_at: ago(now, 70 * HOUR), actor_id: PARTNER },
            { source: 'moment_social', points: 2, created_at: ago(now, 80 * HOUR), actor_id: ME },
            { source: 'mood', points: 3, created_at: ago(now, 90 * HOUR), actor_id: PARTNER },
            { source: 'saving', points: 4, created_at: ago(now, 100 * HOUR), actor_id: ME },
          ],
        }
      case 'moments':
        return { data: [{ title: 'Ramen in Blok M', description: SENTINEL.momentText, created_at: ago(now, 2 * HOUR) }] }
      case 'bucket_items':
        return { data: [{ title: 'Sunrise at Prau', note: SENTINEL.bucketNote, estimated_cost: AMOUNT, done_at: ago(now, 20 * HOUR) }] }
      case 'samakan_sets':
        return { data: [{ matches: 5, max_matches: 7, readout: { text: SENTINEL.readout } }] }
      case 'couple_events':
        return {
          data: [
            { title: 'Anniversary dinner', description: SENTINEL.eventText, budget: AMOUNT, event_date: '2026-11-17', is_recurring: false, event_scope: 'shared', is_completed: false },
            { title: 'Raka dentist', event_date: '2026-11-06', is_recurring: false, event_scope: 'personal', is_completed: false },
          ],
        }
      // Never read by the digest; answered anyway so a stray read would leak.
      case 'letters': return { data: [{ content: SENTINEL.letter }] }
      case 'gratitude_notes': return { data: [{ body: SENTINEL.jar }] }
      case 'daily_responses': return { data: [{ answer: SENTINEL.answer }] }
      case 'moment_comments': return { data: [{ body: SENTINEL.comment }] }
      case 'mood_checkins': return { data: [{ mood: 'sedih', note: SENTINEL.moodNote }] } // copy-ok: stored value
      case 'samakan_rounds': return { data: [{ prompt: SENTINEL.samakanPrompt }] }
      case 'couple_transactions': return { data: [{ amount: AMOUNT }] }
      default:
        return undefined
    }
  }
}

const FORBIDDEN_TABLES = ['letters', 'gratitude_notes', 'daily_responses', 'moment_comments', 'mood_checkins',
  'samakan_rounds', 'samakan_answers', 'couple_transactions', 'savings_entries', 'savings_goals', 'wishlist_items', 'two_truths_rounds']

type NoteRow = Record<string, unknown> & { note_date: string; status: string; attempts: number; updated_at: string; cost_usd: number | null }

/** The service-role side: pet_claim_note and pet_daily_notes as the migration defines them, plus ai_usage. */
function createStore(opts: { quiet?: boolean; status?: PetStatus; ledger?: Array<Record<string, number>> } = {}) {
  const notes = new Map<string, NoteRow>()
  const s = {
    notes,
    quiet: opts.quiet ?? false,
    ledger: opts.ledger ?? [{ input_tokens: 350, cache_read_tokens: 0, cache_write_tokens: 1100, output_tokens: 90, cost_usd: 0.004325 }] as Array<Record<string, number>>,
    claims: [] as Array<{ claimed: boolean; reason: string | null }>,
    /** Push the pending row's last update back in time (to pass the 20 s window). */
    age(ms: number) { for (const r of notes.values()) r.updated_at = new Date(Date.parse(r.updated_at) - ms).toISOString() },
  }
  const claim = (args: { p_pet_id: string; p_note_date: string; p_kind: string }) => {
    const answer = (claimed: boolean, reason: string | null, row: NoteRow | null) => {
      s.claims.push({ claimed, reason })
      return { claimed, reason, attempt: row?.attempts ?? 0, note: row ? { ...row } : null }
    }
    let row = notes.get(args.p_note_date)
    if (!row) {
      if (s.quiet) return answer(false, 'quiet', null)
      const now = new Date().toISOString()
      row = {
        pet_id: args.p_pet_id, couple_id: COUPLE, note_date: args.p_note_date, kind: args.p_kind, status: 'pending',
        source: null, title: null, line: null, highlight: null, pose: null, model: null, input_tokens: null,
        cache_read_tokens: null, cache_write_tokens: null, output_tokens: null, cost_usd: null, attempts: 1,
        created_at: now, updated_at: now,
      }
      notes.set(args.p_note_date, row)
      return answer(true, null, row)
    }
    if (row.status === 'ready') return answer(false, 'ready', row)
    if (Date.now() - Date.parse(row.updated_at) < 20_000) return answer(false, 'busy', row)
    if (row.attempts >= 2) return answer(false, 'attempts', row)
    if (Number(row.cost_usd ?? 0) >= 0.015) return answer(false, 'budget', row)
    row.attempts++
    row.kind = args.p_kind
    row.updated_at = new Date().toISOString()
    return answer(true, null, row)
  }
  const resolve = (q: Query): QueryResult | undefined => {
    switch (q.table) {
      case 'rpc:pet_claim_note':
        return { data: claim(opArgs(q, 'rpc')?.[0] as { p_pet_id: string; p_note_date: string; p_kind: string }) }
      case 'rpc:pet_status':
        return { data: opts.status ?? status() }
      case 'pet_daily_notes': {
        const date = eqArg(q, 'note_date') as string
        const row = notes.get(date)
        if (hasOp(q, 'update')) {
          if (!row || (eqArg(q, 'status') === 'pending' && row.status !== 'pending')) return { data: null }
          Object.assign(row, opArgs(q, 'update')?.[0] as object, { updated_at: new Date().toISOString() })
          return { data: { ...row } }
        }
        return { data: row ? { ...row } : null }
      }
      case 'ai_usage':
        return { data: s.ledger }
      default:
        return undefined
    }
  }
  // The same object: a test may swap `ledger` or flip `quiet` between runs.
  return Object.assign(s, { resolve, claimsMade: s.claims })
}

function fakes(store: ReturnType<typeof createStore>, now: Date, extra?: (q: Query) => QueryResult | undefined) {
  const data = coupleData(now)
  const admin = createFakeSupabase((q) => store.resolve(q) ?? extra?.(q) ?? data(q) ?? { data: [] })
  const user = createFakeSupabase((q) => (q.table === 'rpc:pet_status' ? { data: status() } : data(q) ?? { data: [] }), { id: ME })
  h.adminClient = admin.client
  h.userClient = user.client
  return { admin, user }
}

const okNote = (line = 'You two found a ramen place in Blok M. Broth for me next time, please.', more: Record<string, unknown> = {}) => ({
  ok: true,
  data: { title: '', line, highlight: 'Ramen in Blok M', pose: 'cozy', ...more },
  usage: { input: 1450, output: 90, costUsd: 0.004325 },
})

const run = (store: ReturnType<typeof createStore>, now = THURSDAY, over: { status?: PetStatus; waitMs?: number } = {}) => {
  const { admin, user } = fakes(store, now)
  return resolvePetNote({
    admin: admin.client as never,
    reader: user.client as never,
    status: over.status ?? status(),
    now,
    waitMs: over.waitMs ?? 0,
  })
}

beforeEach(() => {
  h.configured = true
  h.calls.length = 0
  h.replies.length = 0
  h.delayMs = 0
  h.pushes.length = 0
  delete process.env.PET_AI_ENABLED
})

afterEach(() => {
  vi.useRealTimers()
})

// ---- The checks on a note -----------------------------------------------------

describe.skipIf(REAL)('note checks and templates', () => {
  const note = (line: string, title: string | null = null) => ({ title, line, highlight: null, pose: 'cozy' as const })

  it('every template passes the same checks as a model note (gate 20)', () => {
    for (const line of ALL_TEMPLATE_LINES) {
      expect(noteProblem(note(line), 'daily', { names: ['Raka', 'Dita'], heavy: true }), line).toBeNull()
      expect(noteProblem(note(line, 'My week with you two'), 'weekly'), line).toBeNull()
    }
    for (const state of ['glowing', 'cozy', 'dozy'] as const) {
      for (const kind of ['daily', 'weekly'] as const) {
        const t = templateNote({ kind, state, heavy: false, top: 'moment' })
        expect(noteProblem(t, kind)).toBeNull()
        expect(templateNote({ kind, state, heavy: true, top: null }).pose).toBe('comfort')
      }
    }
  })

  it('templates follow state first, then the top source of the last 24 hours', () => {
    expect(templateNote({ kind: 'daily', state: 'cozy', heavy: true, top: 'moment' }).line).toBe('Soft day today. I\'m staying close.')
    expect(templateNote({ kind: 'daily', state: 'dozy', heavy: false, top: 'moment' }).line).toBe('Quiet day. I\'m guarding the sofa.')
    expect(templateNote({ kind: 'daily', state: 'cozy', heavy: false, top: 'letter' }).line).toMatch(/not allowed to read it/)
    expect(templateNote({ kind: 'weekly', state: 'cozy', heavy: false, top: null }).title).toBe('My week with you two')
  })

  it('rejects an em dash, emoji, banned words, money and an overlong line (gate 20)', () => {
    expect(noteProblem(note('Three Kangens — I counted.'), 'daily')).toBe('em dash')
    expect(noteProblem(note('Three Kangens! \u{1F431}'), 'daily')).toBe('emoji')
    for (const bad of ['I felt lonely today.', 'You should send a Kangen.', 'What a journey.', 'I was so hungry.',
      'You haven’t said hi.', 'Don\'t forget me.', 'A sad little nap.', 'Our bond grows.', 'You forgot me.']) {
      expect(noteProblem(note(bad), 'daily'), bad).toBe('banned word')
    }
    expect(noteProblem(note('You saved Rp 50.000 this week.'), 'daily')).toBe('money amount')
    expect(noteProblem(note('x'.repeat(160)), 'daily')).toBeNull()
    expect(noteProblem(note('x'.repeat(161)), 'daily')).toMatch(/over 160/)
    expect(noteProblem(note('x'.repeat(280), 'A week of things'), 'weekly')).toBeNull()
    expect(noteProblem(note('x'.repeat(281), 'A week of things'), 'weekly')).toMatch(/over 280/)
    expect(noteProblem(note('A fine week.', 'Week'), 'weekly')).toMatch(/2 to 5 words/)
    expect(noteProblem(note('A fine week.', 'One two three four five six'), 'weekly')).toMatch(/2 to 5 words/)
    // Inflections are caught ("sadly"); words that merely start the same pass ("shoulder").
    expect(noteProblem(note('I sat on your shoulder bag. Sadly comfy.'), 'daily')).toBe('banned word')
    expect(noteProblem(note('I sat on your shoulder bag. Very comfy.'), 'daily')).toBeNull()
  })

  it('on a heavy day the note names neither the mood nor the person', () => {
    const ctx = { names: ['Raka', 'Dita'], heavy: true }
    expect(noteProblem(note('Dita, I\'m right here.'), 'daily', ctx)).toMatch(/names a partner/)
    expect(noteProblem(note('Long, tired day. I\'m close.'), 'daily', ctx)).toMatch(/names the mood/)
    expect(noteProblem(note('Soft day today. I\'m staying close.'), 'daily', ctx)).toBeNull()
    expect(noteProblem(note('Dita found a ramen place.'), 'daily', { names: ['Raka', 'Dita'], heavy: false })).toBeNull()
  })

  it('Monday is the weekly note, in Jakarta time', () => {
    expect(noteKindFor('2026-11-09')).toBe('weekly')
    expect(noteKindFor('2026-11-05')).toBe('daily')
    expect(noteKindFor('2026-11-08')).toBe('daily')
  })
})

// ---- Data minimization (gate 22) ------------------------------------------------

describe.skipIf(REAL)('the digest never carries private text', () => {
  it('reads only DIGEST_READS columns and no private table', async () => {
    const store = createStore()
    const { user } = fakes(store, THURSDAY)
    await loadDigestSource(user.client as never, status(), { today: '2026-11-05', kind: 'daily', now: THURSDAY })
    const tables = user.log.map((q) => q.table)
    for (const t of FORBIDDEN_TABLES) expect(tables, t).not.toContain(t)
    for (const q of user.log) {
      const select = opArgs(q, 'select')?.[0]
      expect(select, q.table).toBe(DIGEST_READS[q.table as keyof typeof DIGEST_READS])
    }
    // The read list itself: ids, counts, dates, flags and titles, nothing else.
    const allowed = new Set(['profile_id', 'id', 'name', 'source', 'points', 'created_at', 'title', 'done_at',
      'matches', 'max_matches', 'event_date', 'is_recurring', 'event_scope', 'is_completed'])
    for (const [table, cols] of Object.entries(DIGEST_READS)) {
      for (const col of cols.split(',').map((c) => c.trim())) expect(allowed.has(col), `${table}.${col}`).toBe(true)
    }
  })

  it('the prompt sent to Claude contains no letter, Jar, answer, comment or mood-note text and no amounts', async () => {
    const store = createStore()
    h.replies.push(okNote())
    const comfort = status({ comfort_for: [PARTNER] })
    await run(store, THURSDAY, { status: comfort })
    expect(h.calls).toHaveLength(1)
    const prompt = String(h.calls[0].prompt)
    for (const value of Object.values(SENTINEL)) expect(prompt).not.toContain(value)
    expect(prompt).not.toContain(String(AMOUNT))
    expect(prompt).not.toMatch(/sedih|description|budget|estimated_cost/) // copy-ok: stored value

    const digest = JSON.parse(prompt) as PetDigest
    expect(digest).toMatchObject({
      date: '2026-11-05', weekday: 'Thursday', note_kind: 'daily',
      pet: { name: 'Mochi', type: 'cat', level: 6, stage: 'growing' },
      partners: ['Raka', 'Dita'],
      said_hi_today: ['Dita'],
      heavy_mood_today: true,
      upcoming: { title: 'Anniversary dinner', days: 12 },
      state: 'cozy',
    })
    expect(digest.highlights).toEqual(['Ramen in Blok M', 'Sunrise at Prau', 'Samakan: 5 of 7 matched'])
    expect(digest.last_7_days).toEqual({ moment: 1, kangen: 2, letter: 1, jar: 1, daily: 1, moment_social: 1, mood: 1, saving: 1 })
    expect(Object.keys(digest).sort()).toEqual(['date', 'heavy_mood_today', 'highlights', 'last_7_days', 'note_kind', 'partners',
      'pet', 'said_hi_today', 'state', 'upcoming', 'weekday'])
  })

  it('buildPetDigest copies named fields only, whatever the rows carry', () => {
    const digest = buildPetDigest({
      today: '2026-11-05', kind: 'daily', status: status(),
      members: [{ id: ME, name: 'Raka', bio: SENTINEL.answer } as never],
      warmth: [{ source: 'letter', points: 8, created_at: ago(THURSDAY, HOUR), body: SENTINEL.letter } as never],
      moments: [{ title: 'A very long Moment title that goes on and on past the sixty character limit for sure', created_at: ago(THURSDAY, HOUR), description: SENTINEL.momentText } as never],
      bucketDone: [], samakan: [],
      calendar: [{ title: 'Recurring birthday', event_date: '2001-11-07', is_recurring: true, event_scope: null, is_completed: false }],
    })
    const json = JSON.stringify(digest)
    for (const value of Object.values(SENTINEL)) expect(json).not.toContain(value)
    expect(digest.highlights[0].length).toBeLessThanOrEqual(60)
    expect(digest.upcoming).toEqual({ title: 'Recurring birthday', days: 2 })
  })

  it('a level reached this week brings new_item', () => {
    const digest = buildPetDigest({
      today: '2026-11-05', kind: 'daily', status: status({ level: 7, xp: 605 }),
      members: [], warmth: [{ source: 'moment', points: 10, created_at: ago(THURSDAY, HOUR) }],
      moments: [], bucketDone: [], samakan: [], calendar: [],
    })
    expect(digest.pet.new_item).toBe('a little plant')
  })
})

// ---- One call per pet per day (gates 17-21) -----------------------------------------

describe.skipIf(REAL)('today\'s note: claim, call, store', () => {
  it('calls Sonnet once with the frozen, cached system prompt and stores tokens and cost', async () => {
    const store = createStore()
    h.replies.push(okNote())
    const result = await run(store)
    expect(result.outcome).toBe('written_ai')
    expect(result.note).toMatchObject({ source: 'ai', kind: 'daily', title: null, pose: 'cozy', note_date: '2026-11-05' })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]).toMatchObject({
      feature: 'pet_note', coupleId: COUPLE, system: PET_NOTE_SYSTEM, schema: PET_NOTE_SCHEMA,
      maxTokens: PET_NOTE_MAX_TOKENS, cacheSystem: true,
    })
    expect(PET_NOTE_SYSTEM).not.toMatch(/2026|Thursday, \d|Raka Pratama/)
    const row = store.notes.get('2026-11-05')!
    expect(row).toMatchObject({
      status: 'ready', source: 'ai', model: 'claude-sonnet-5-5',
      input_tokens: 350, cache_read_tokens: 0, cache_write_tokens: 1100, output_tokens: 90, cost_usd: 0.004325,
    })
  })

  it('an AI row keeps non-null tokens and cost even when the ledger lookup finds nothing (gate 21)', async () => {
    const store = createStore({ ledger: [] })
    h.replies.push(okNote())
    await run(store)
    const row = store.notes.get('2026-11-05')!
    for (const col of ['model', 'input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'output_tokens', 'cost_usd']) {
      expect(row[col], col).not.toBeNull()
    }
    expect(row.cost_usd).toBe(0.004325)
  })

  it('two requests at once make exactly one model call and get the same note (gate 17)', async () => {
    const store = createStore()
    h.delayMs = 120
    h.replies.push(okNote())
    const [a, b] = await Promise.all([run(store, THURSDAY, { waitMs: 3000 }), run(store, THURSDAY, { waitMs: 3000 })])
    expect(h.calls).toHaveLength(1)
    expect(a.note).toEqual(b.note)
    expect(a.note.source).toBe('ai')
    expect(store.claimsMade.filter((c) => c.claimed)).toHaveLength(1)
  })

  it('never more than 2 attempts a day; a failure is retried once after the pending window (gate 17)', async () => {
    const store = createStore()
    h.replies.push({ ok: false, reason: 'invalid', detail: 'not JSON' }, { ok: false, reason: 'timeout' }, okNote())
    const first = await run(store)
    expect(first.outcome).toBe('template')
    expect(store.notes.get('2026-11-05')!.status).toBe('pending')
    // Within 20 s the row is still busy: no second call.
    const busy = await run(store)
    expect(busy.note).toMatchObject({ source: 'template', pending: true })
    expect(h.calls).toHaveLength(1)
    store.age(25_000)
    const second = await run(store)
    expect(second.outcome).toBe('written_template')
    store.age(25_000)
    const third = await run(store)
    expect(third.outcome).toBe('stored')
    expect(third.note.source).toBe('template')
    expect(h.calls).toHaveLength(2)
  })

  it('no key: a template, no claim and no model call (gate 18)', async () => {
    h.configured = false
    const store = createStore()
    const { admin } = fakes(store, THURSDAY)
    const result = await resolvePetNote({ admin: admin.client as never, reader: admin.client as never, status: status(), now: THURSDAY })
    expect(result).toMatchObject({ outcome: 'template', detail: 'ai_off' })
    expect(result.note.source).toBe('template')
    expect(h.calls).toHaveLength(0)
    expect(admin.log.some((q) => q.table === 'rpc:pet_claim_note')).toBe(false)
  })

  it('PET_AI_ENABLED=false is the same kill switch', async () => {
    process.env.PET_AI_ENABLED = 'false'
    const result = await run(createStore())
    expect(result.detail).toBe('ai_off')
    expect(h.calls).toHaveLength(0)
  })

  it('no warmth in 7 days: no model call, nothing stored (gate 19)', async () => {
    const store = createStore({ quiet: true })
    const result = await run(store)
    expect(result).toMatchObject({ outcome: 'template', detail: 'quiet' })
    expect(h.calls).toHaveLength(0)
    expect(store.notes.size).toBe(0)
  })

  it('the day\'s budget or attempts used up: no call, the day closes with one shared template (gate 21)', async () => {
    const store = createStore()
    store.notes.set('2026-11-05', {
      pet_id: PET, couple_id: COUPLE, note_date: '2026-11-05', kind: 'daily', status: 'pending', attempts: 1,
      cost_usd: 0.015, updated_at: new Date(Date.now() - 60_000).toISOString(),
    })
    const result = await run(store)
    expect(h.calls).toHaveLength(0)
    expect(result).toMatchObject({ outcome: 'written_template', detail: 'budget' })
    expect(store.notes.get('2026-11-05')).toMatchObject({ status: 'ready', source: 'template', cost_usd: 0.015 })
  })

  it.each([
    ['cap', { ok: false, reason: 'cap' }],
    ['refusal', { ok: false, reason: 'refusal' }],
    ['no_key', { ok: false, reason: 'no_key' }],
    ['bad key', { ok: false, reason: 'error', detail: 'http_401' }],
  ])('%s: the day closes with a template at once', async (_label, reply) => {
    const store = createStore()
    h.replies.push(reply)
    const result = await run(store)
    expect(result.outcome).toBe('written_template')
    expect(store.notes.get('2026-11-05')).toMatchObject({ status: 'ready', source: 'template' })
    expect(h.calls).toHaveLength(1)
  })

  it.each([
    ['em dash', 'Three Kangens before lunch — I counted.'],
    ['emoji', 'Three Kangens before lunch. \u{1F63A}'],
    ['banned word', 'I was lonely until you said hi.'],
    ['too long', `${'Very long line. '.repeat(11)}`],
  ])('model output with %s is replaced by a template, and the row waits for the one retry (gate 20)', async (_label, line) => {
    const store = createStore()
    h.replies.push(okNote(line))
    const result = await run(store)
    expect(result.outcome).toBe('template')
    expect(result.note.source).toBe('template')
    expect(result.note.line).not.toBe(line)
    // Untouched, so the 20 s window still runs from the claim.
    expect(store.notes.get('2026-11-05')).toMatchObject({ status: 'pending', cost_usd: null, attempts: 1 })
  })

  it('the day\'s spend from every attempt lands on the row when the day closes (gate 21)', async () => {
    const store = createStore()
    h.replies.push(okNote('Three Kangens — I counted.'), okNote())
    await run(store)
    store.age(25_000)
    store.ledger = [
      { input_tokens: 350, cache_read_tokens: 0, cache_write_tokens: 1100, output_tokens: 90, cost_usd: 0.004325 },
      { input_tokens: 350, cache_read_tokens: 1100, cache_write_tokens: 0, output_tokens: 80, cost_usd: 0.00172 },
    ]
    const second = await run(store)
    expect(second.outcome).toBe('written_ai')
    expect(store.notes.get('2026-11-05')).toMatchObject({
      status: 'ready', source: 'ai', attempts: 2,
      input_tokens: 700, cache_read_tokens: 1100, cache_write_tokens: 1100, output_tokens: 170, cost_usd: 0.006045,
    })
  })

  it('a row left pending by a failed attempt is not waited on', async () => {
    const store = createStore()
    store.notes.set('2026-11-05', {
      pet_id: PET, couple_id: COUPLE, note_date: '2026-11-05', kind: 'daily', status: 'pending', attempts: 1,
      cost_usd: null, created_at: new Date(Date.now() - 15_000).toISOString(), updated_at: new Date(Date.now() - 15_000).toISOString(),
    })
    const started = Date.now()
    const result = await run(store, THURSDAY, { waitMs: 3000 })
    expect(Date.now() - started).toBeLessThan(500)
    expect(result.note).toMatchObject({ source: 'template', pending: true })
    expect(h.calls).toHaveLength(0)
  })

  it('a heavy day always uses the comfort pose', async () => {
    h.replies.push(okNote('Soft day today. I\'m staying close.', { pose: 'glowing', highlight: '' }))
    const result = await run(createStore(), THURSDAY, { status: status({ comfort_for: [PARTNER] }) })
    expect(result.note).toMatchObject({ source: 'ai', pose: 'comfort', highlight: null })
  })

  it('before 05:00 WIB yesterday\'s note is still today\'s, and nothing is claimed', async () => {
    const early = new Date('2026-11-04T21:00:00Z') // 04:00 WIB on the 5th
    const store = createStore()
    store.notes.set('2026-11-04', {
      note_date: '2026-11-04', kind: 'daily', status: 'ready', source: 'ai', title: null,
      line: 'Nine Kangens this week. I counted.', highlight: 'Nine Kangens', pose: 'glowing', attempts: 1,
      cost_usd: 0.002, updated_at: '2026-11-04T01:00:00Z',
    })
    const result = await run(store, early)
    expect(result).toMatchObject({ outcome: 'stored', note: { note_date: '2026-11-04', line: 'Nine Kangens this week. I counted.' } })
    expect(store.claimsMade).toHaveLength(0)
    expect(h.calls).toHaveLength(0)
  })

  it('Monday: the weekly recap, feature pet_weekly, with a title', async () => {
    const store = createStore()
    h.replies.push(okNote('Two Moments, one letter still sealed, and a lot of Kangen. I put it all on my shelf.', { title: 'A week of small things' }))
    const result = await run(store, new Date('2026-11-09T03:00:00Z'))
    expect(h.calls[0].feature).toBe('pet_weekly')
    expect(JSON.parse(String(h.calls[0].prompt)).note_kind).toBe('weekly')
    expect(result.note).toMatchObject({ kind: 'weekly', title: 'A week of small things', source: 'ai' })
  })

  it('generatePetNote passes the model answer through the checks', async () => {
    h.replies.push(okNote('Dita, I\'m right here.'))
    const digest = buildPetDigest({
      today: '2026-11-05', kind: 'daily', status: status({ comfort_for: [PARTNER] }),
      members: [{ id: ME, name: 'Raka' }, { id: PARTNER, name: 'Dita' }], warmth: [], moments: [], bucketDone: [], samakan: [], calendar: [],
    })
    expect(await generatePetNote(digest, COUPLE)).toMatchObject({ ok: false, reason: 'rejected', detail: 'names a partner on a heavy day' })
  })
})

// ---- /api/pet/today ------------------------------------------------------------------

describe.skipIf(REAL)('GET /api/pet/today', () => {
  it('401 when signed out', async () => {
    h.userClient = createFakeSupabase(() => ({ data: null })).client
    expect((await todayGet()).status).toBe(401)
  })

  it('note null while the couple has no pet', async () => {
    h.userClient = createFakeSupabase((q) => (q.table === 'rpc:pet_status' ? { data: null } : { data: [] }), { id: ME }).client
    const res = await todayGet()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ note: null })
  })

  it('no ANTHROPIC_API_KEY: 200 with a template, no claim, no model call (gate 18)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(THURSDAY)
    h.configured = false
    const store = createStore()
    const { admin } = fakes(store, THURSDAY)
    const res = await todayGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.note).toMatchObject({ source: 'template', note_date: '2026-11-05', kind: 'daily' })
    expect(Object.keys(body.note)).not.toContain('cost_usd')
    expect(h.calls).toHaveLength(0)
    expect(admin.log.some((q) => q.table.startsWith('rpc:pet_claim_note'))).toBe(false)
  })

  it('with a key: the first request writes the AI note, the next one reads it', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(THURSDAY)
    const store = createStore()
    fakes(store, THURSDAY)
    h.replies.push(okNote())
    const first = await (await todayGet()).json()
    const second = await (await todayGet()).json()
    expect(first.note).toEqual(second.note)
    expect(first.note.source).toBe('ai')
    expect(h.calls).toHaveLength(1)
  })
})

// ---- The Monday note in the existing cron (gate 25) ---------------------------------

describe.skipIf(REAL)('Monday note inside /api/cron/event-reminders', () => {
  const cronReq = () => ({ headers: new Headers({ authorization: 'Bearer test-secret' }) }) as never

  function cronFakes(store: ReturnType<typeof createStore>) {
    return fakes(store, MONDAY, (q) => {
      switch (q.table) {
        case 'couple_events':
          // The reminders query (paged) finds nothing due; the digest's calendar read gets the fixture.
          return hasOp(q, 'range') ? { data: [] } : undefined
        case 'couple_pets': return { data: [{ id: PET, couple_id: COUPLE }] }
        case 'couples': return { data: [{ id: COUPLE, closed_at: null }] }
        default: return undefined
      }
    })
  }

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(MONDAY)
  })

  it('writes the weekly note and pushes both partners with kind pet, quiet hours applying', async () => {
    const store = createStore()
    cronFakes(store)
    h.replies.push(okNote('Two Moments, one letter still sealed, and a lot of Kangen. I put it all on my shelf.', { title: 'A week of small things' }))
    const res = await cronGet(cronReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ today: '2026-11-09', due: 0, reminded: [] })
    expect(body.pet_weekly).toMatchObject({ ran: true, pets: 1, notes_ai: 1, pushed: 2 })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].feature).toBe('pet_weekly')
    expect(h.pushes.map((p) => p.profileId).sort()).toEqual([ME, PARTNER])
    for (const p of h.pushes) {
      expect(p.kind).toBe('pet')
      expect(p.options).toBeUndefined() // no ignoreQuietHours: a muted Monday push is skipped
      expect(p.payload).toEqual({
        title: 'A note from Mochi',
        body: 'Your week, written by a cat who was paying attention.',
        url: '/app/pet',
      })
    }
  })

  it('a re-run the same Monday makes no call and sends no second push', async () => {
    const store = createStore()
    cronFakes(store)
    h.replies.push(okNote('Two Moments and a lot of Kangen. I put it all on my shelf.', { title: 'A week of small things' }))
    await cronGet(cronReq())
    h.pushes.length = 0
    const again = await (await cronGet(cronReq())).json()
    expect(again.pet_weekly).toMatchObject({ ran: true, notes_ai: 0, pushed: 0 })
    expect(h.calls).toHaveLength(1)
    expect(h.pushes).toHaveLength(0)
  })

  it('no push when the model failed or the couple was quiet', async () => {
    const failed = createStore()
    cronFakes(failed)
    h.replies.push({ ok: false, reason: 'refusal' })
    expect((await (await cronGet(cronReq())).json()).pet_weekly).toMatchObject({ notes_ai: 0, notes_other: 1, pushed: 0 })
    const quiet = createStore({ quiet: true })
    cronFakes(quiet)
    expect((await (await cronGet(cronReq())).json()).pet_weekly).toMatchObject({ notes_ai: 0, pushed: 0 })
    expect(h.pushes).toHaveLength(0)
  })

  it('not Monday in Jakarta: no pet work at all', async () => {
    vi.setSystemTime(new Date('2026-11-09T17:30:00Z')) // Tuesday 00:30 WIB
    const store = createStore()
    const { admin } = cronFakes(store)
    const body = await (await cronGet(cronReq())).json()
    expect(body.pet_weekly).toEqual({ ran: false, reason: 'not_monday' })
    expect(admin.log.some((q) => q.table === 'couple_pets' || q.table.startsWith('rpc:pet_'))).toBe(false)
  })

  it('AI off: no claims, no pushes', async () => {
    h.configured = false
    cronFakes(createStore())
    const body = await (await cronGet(cronReq())).json()
    expect(body.pet_weekly).toEqual({ ran: false, reason: 'ai_off' })
    expect(h.pushes).toHaveLength(0)
  })

  it('the route source: reminders keep ignoreQuietHours, the pet push never has it, and no new Vercel cron', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/cron/event-reminders/route.ts'), 'utf8')
    expect(src).toMatch(/'reminders',\s*\{\s*ignoreQuietHours:\s*true\s*\}/)
    expect(src).toMatch(/sendPushToProfile\(profileId, payload, 'pet'\)/)
    expect(src).not.toMatch(/'pet',\s*\{/)
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: unknown[] }
    expect(vercel.crons).toHaveLength(2)
  })
})

// ---- Push kind 'pet' (gate 25) ---------------------------------------------------------

describe.skipIf(REAL)("push kind 'pet'", () => {
  const ALL_ON: MutePrefs = {
    kangen: true, letters: true, moments: true, reminders: true, activity: true, games: true, pet: true,
    quiet_start: null, quiet_end: null,
  }
  const NIGHT = new Date('2026-11-04T15:00:00Z') // 22:00 WIB

  it('is a kind the server sends, but no client request can name it', () => {
    expect(PUSH_KINDS).toContain('pet')
    expect(SERVER_ONLY_PUSH_KINDS).toEqual(['pet'])
    expect(isPushKind('pet')).toBe(false)
    expect(isPushKind('games')).toBe(true)
  })

  it('the Pet Kita switch mutes it; quiet hours hold it back', () => {
    expect(isPushMuted({ ...ALL_ON, pet: false }, 'pet', {}, NIGHT)).toBe(true)
    expect(isPushMuted(ALL_ON, 'pet', {}, NIGHT)).toBe(false)
    expect(isPushMuted({ ...ALL_ON, quiet_start: 22, quiet_end: 6 }, 'pet', {}, NIGHT)).toBe(true)
    expect(isPushMuted({ ...ALL_ON, pet: false }, 'kangen', {}, NIGHT)).toBe(false)
    const { pet: _omit, ...withoutPet } = ALL_ON
    expect(isPushMuted(withoutPet, 'pet', {}, NIGHT)).toBe(false)
  })

  it('sendPushToProfile reads the pet column and skips the send when it is off', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public'
    process.env.VAPID_PRIVATE_KEY = 'test-private'
    const fake = createFakeSupabase((q) => {
      if (q.table === 'notification_prefs') return { data: { ...ALL_ON, pet: false } }
      throw new Error(`unexpected query on ${q.table}`)
    })
    h.adminClient = fake.client
    const real = await vi.importActual<typeof import('@/lib/push-server')>('@/lib/push-server')
    expect(await real.sendPushToProfile(PARTNER, { title: 't', body: 'b', url: '/app/pet' }, 'pet'))
      .toEqual({ sent: 0, failed: 0, stale: 0, muted: true })
    const select = String(opArgs(fake.log[0], 'select')?.[0])
    expect(select.split(',').map((s) => s.trim())).toContain('pet')
  })
})

// ---- Adoption push ---------------------------------------------------------------------

describe.skipIf(REAL)('POST /api/pet/adopt', () => {
  const PET_ROW = { id: PET, couple_id: COUPLE, pet_type: 'cat', name: 'Mochi', level: 1, xp: 0, created_at: '2026-11-05T03:00:00Z', hatched_at: null }
  const req = (body: unknown) => ({ json: async () => body }) as never

  function adoptFakes(opts: { before: boolean; mine: boolean }) {
    h.userClient = createFakeSupabase((q) => {
      switch (q.table) {
        case 'couple_members': return { data: { couple_id: COUPLE } }
        case 'couple_pets': return { data: opts.before ? { id: PET } : null }
        case 'rpc:adopt_pet': return { data: PET_ROW }
        case 'activities': return { data: opts.mine ? [{ id: 'act-1' }] : [] }
        default: throw new Error(`unexpected user query on ${q.table}`)
      }
    }, { id: ME }).client
    h.adminClient = createFakeSupabase((q) => {
      switch (q.table) {
        case 'couple_members': return { data: [{ profile_id: ME }, { profile_id: PARTNER }] }
        case 'profiles': return { data: { name: 'Raka Pratama' } }
        default: throw new Error(`unexpected admin query on ${q.table}`)
      }
    }).client
  }

  it('the adopter\'s partner gets the one adoption push', async () => {
    adoptFakes({ before: false, mine: true })
    const res = await adoptPost(req({ type: 'Cat', name: '  Mochi ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ alreadyAdopted: false, pet: { id: PET } })
    expect(h.pushes).toEqual([{
      profileId: PARTNER,
      payload: { title: 'Meet Mochi', body: 'Raka adopted a cat called Mochi. Come say hi.', url: '/app/pet' },
      kind: 'pet',
      options: undefined,
    }])
  })

  it('no push when the partner was faster or the pet was already there', async () => {
    adoptFakes({ before: false, mine: false })
    expect(await (await adoptPost(req({ type: 'dog', name: 'Kopi' }))).json()).toMatchObject({ alreadyAdopted: true })
    adoptFakes({ before: true, mine: true })
    expect(await (await adoptPost(req({ type: 'dog', name: 'Kopi' }))).json()).toMatchObject({ alreadyAdopted: true })
    expect(h.pushes).toHaveLength(0)
  })

  it('checks type and name before calling the database', async () => {
    adoptFakes({ before: false, mine: true })
    expect((await adoptPost(req({ type: 'parrot', name: 'Kiwi' }))).status).toBe(400)
    expect((await adoptPost(req({ type: 'cat', name: 'x'.repeat(21) }))).status).toBe(400)
    expect(h.pushes).toHaveLength(0)
  })
})

// ---- Account export ---------------------------------------------------------------------

describe.skipIf(REAL)('account export: pet and Samakan', () => {
  it('includes the pet ledger and notes, and only my own Samakan answers', async () => {
    const user = createFakeSupabase((q) => {
      const single = hasOp(q, 'maybeSingle')
      switch (q.table) {
        case 'couple_members': return single ? { data: { couple_id: COUPLE } } : { data: [{ profile_id: ME, joined_at: 'x' }, { profile_id: PARTNER, joined_at: 'y' }] }
        case 'couple_pets': return { data: [{ id: PET, name: 'Mochi' }] }
        case 'pet_warmth_events': return { data: [{ id: 'w1', source: 'hi', points: 5 }] }
        case 'pet_daily_notes': return { data: [{ note_date: '2026-11-05', line: 'Hello.' }] }
        case 'pet_visits': return { data: [{ pet_id: PET, profile_id: ME }] }
        case 'samakan_sets': return { data: [{ id: 'set-1' }] }
        case 'samakan_rounds': return { data: [{ id: 'round-1', set_id: 'set-1' }] }
        case 'profiles': return single ? { data: { id: ME } } : { data: [] }
        default: return single ? { data: null } : { data: [] }
      }
    }, { id: ME })
    const admin = createFakeSupabase((q) => {
      switch (q.table) {
        case 'letters': return { data: [] }
        // A fake that ignores the filter: the route must still keep only my rows.
        case 'samakan_answers': return { data: [
          { id: 'a1', set_id: 'set-1', profile_id: ME, pick: 1 },
          { id: 'a2', set_id: 'set-1', profile_id: PARTNER, pick: 2 },
          { id: 'a3', set_id: 'set-other', profile_id: ME, pick: 3 },
        ] }
        default: throw new Error(`unexpected admin query on ${q.table}`)
      }
    })
    h.userClient = user.client
    h.adminClient = admin.client
    const res = await exportGet()
    expect(res.status).toBe(200)
    const body = JSON.parse(await res.text())
    expect(body.pet).toMatchObject({ warmth_events: [{ id: 'w1' }], daily_notes: [{ note_date: '2026-11-05' }], my_visits: [{ profile_id: ME }] })
    expect(body.samakan.sets).toEqual([{ id: 'set-1' }])
    expect(body.samakan.my_answers).toEqual([{ id: 'a1', set_id: 'set-1', profile_id: ME, pick: 1 }])
    const answersQuery = admin.log.find((q) => q.table === 'samakan_answers')!
    expect(eqArg(answersQuery, 'profile_id')).toBe(ME)
  })
})

// ---- Local database (opt-in, PET_DB=1) --------------------------------------------------------
// The real claim RPC, note constraints, ledger, grants and RLS; real
// claudeJson against the local fake Messages API. Never the network.

describe.skipIf(!DB)('against the local database (PET_DB=1)', () => {
  type Sb = import('@supabase/supabase-js').SupabaseClient
  let service: Sb
  let fake: FakeAnthropic
  const userIds: string[] = []
  const coupleIds: string[] = []
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  /** 10:00 WIB today: past the 05:00 opening whatever the clock says. */
  const noteNow = () => new Date(`${todayJakarta()}T10:00:00+07:00`)
  // A title that also passes on a Monday (weekly note); daily notes drop it.
  const answer = (line: string, more: Record<string, unknown> = {}) =>
    jsonMessage({ title: 'A week of small things', line, highlight: 'Ramen in Blok M', pose: 'cozy', ...more },
      { input_tokens: 350, output_tokens: 90, cache_creation_input_tokens: 1100 })

  async function user(name: string) {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(url, anon, opts)
    const { data, error } = await client.auth.signUp({
      email: `pet-${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`,
      password: 'verify-pass-123',
    })
    if (error || !data.user) throw new Error(`signUp ${name}: ${error?.message}`)
    userIds.push(data.user.id)
    await client.from('profiles').update({ name }).eq('id', data.user.id)
    return { id: data.user.id, client }
  }

  async function couple(withPet: boolean) {
    const a = await user('Raka'), b = await user('Dita')
    const { data: c, error } = await a.client.rpc('create_couple')
    if (error) throw new Error(`create_couple: ${error.message}`)
    coupleIds.push(c.id)
    const { error: joinError } = await b.client.rpc('join_couple', { p_code: c.invite_code })
    if (joinError) throw new Error(`join_couple: ${joinError.message}`)
    if (withPet) {
      h.userClient = a.client
      const res = await adoptPost(({ json: async () => ({ type: 'cat', name: 'Mochi' }) }) as never)
      if (res.status !== 200) throw new Error(`adopt: ${res.status} ${await res.text()}`)
    }
    return { a, b, coupleId: c.id as string }
  }

  const statusOf = async (client: Sb) => {
    const { data, error } = await client.rpc('pet_status', {})
    if (error) throw new Error(error.message)
    return data as PetStatus
  }
  const noteRow = async (petId: string) => (await service.from('pet_daily_notes').select('*').eq('pet_id', petId).maybeSingle()).data

  beforeAll(async () => {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error('refusing to run: Supabase is not local')
    const { createClient } = await import('@supabase/supabase-js')
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts)
    fake = await startFakeAnthropic()
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234'
    process.env.ANTHROPIC_BASE_URL = fake.baseUrl
  })

  beforeEach(() => fake.reset())

  afterAll(async () => {
    for (const id of coupleIds) await service.from('couples').delete().eq('id', id)
    for (const id of userIds) await service.auth.admin.deleteUser(id)
    await fake?.close()
  })

  it('adopt pushes the partner once; a hi; one model call writes the note with the ledger\'s tokens and cost', async () => {
    const { a, b } = await couple(true)
    expect(h.pushes.map((p) => [p.profileId, p.kind])).toEqual([[b.id, 'pet']])
    h.userClient = b.client
    expect(await (await adoptPost(({ json: async () => ({ type: 'dog', name: 'Kopi' }) }) as never)).json())
      .toMatchObject({ alreadyAdopted: true, pet: { name: 'Mochi' } })
    expect(h.pushes).toHaveLength(1)

    const { error: hiError } = await a.client.rpc('pet_say_hi', { p_gesture: 'pat' })
    expect(hiError).toBeNull()
    fake.reply(answer('You two found a ramen place in Blok M. Broth for me next time, please.'))
    const first = await resolvePetNote({ admin: service as never, reader: a.client as never, status: await statusOf(a.client), now: noteNow() })
    expect(first.outcome).toBe('written_ai')
    const second = await resolvePetNote({ admin: service as never, reader: b.client as never, status: await statusOf(b.client), now: noteNow() })
    expect(second).toMatchObject({ outcome: 'stored', note: first.note })
    expect(fake.requests).toHaveLength(1)

    const body = fake.requests[0].body!
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.output_config?.effort).toBe('low')
    expect((body.system as Array<{ cache_control?: unknown }>)[0].cache_control).toEqual({ type: 'ephemeral' })
    const digest = JSON.parse(String((body.messages![0] as { content: string }).content)) as PetDigest
    expect(digest).toMatchObject({ partners: ['Raka', 'Dita'], said_hi_today: ['Raka'], last_7_days: { hi: 1 } })

    const row = await noteRow((await statusOf(a.client)).pet_id)
    expect(row).toMatchObject({
      status: 'ready', source: 'ai', model: 'claude-sonnet-5-5', attempts: 1,
      input_tokens: 350, cache_read_tokens: 0, cache_write_tokens: 1100, output_tokens: 90,
    })
    expect(Number(row!.cost_usd)).toBe(0.00435)

    // Members read the notes; the export carries the pet ledger and notes.
    h.userClient = a.client
    const exported = JSON.parse(await (await exportGet()).text())
    expect(exported.pet.warmth_events.length).toBeGreaterThanOrEqual(1)
    expect(exported.pet.daily_notes).toHaveLength(1)
    expect(Array.isArray(exported.samakan.my_answers)).toBe(true)
  }, 60_000)

  it('two requests at once: one model call, the same note for both', async () => {
    const { a, b } = await couple(true)
    await a.client.rpc('pet_say_hi', { p_gesture: 'snack' })
    fake.always({ ...answer('Nine Kangens this week. I counted.'), delayMs: 400 })
    const [x, y] = await Promise.all([
      resolvePetNote({ admin: service as never, reader: a.client as never, status: await statusOf(a.client), now: noteNow(), waitMs: 9000 }),
      resolvePetNote({ admin: service as never, reader: b.client as never, status: await statusOf(b.client), now: noteNow(), waitMs: 9000 }),
    ])
    expect(fake.requests).toHaveLength(1)
    expect(x.note).toEqual(y.note)
    expect(x.note.source).toBe('ai')
  }, 60_000)

  it('no warmth in 7 days: no call, nothing stored', async () => {
    const { a } = await couple(true)
    const status = await statusOf(a.client)
    const result = await resolvePetNote({ admin: service as never, reader: a.client as never, status, now: noteNow() })
    expect(result).toMatchObject({ outcome: 'template', detail: 'quiet' })
    expect(fake.requests).toHaveLength(0)
    expect(await noteRow(status.pet_id)).toBeNull()
  })

  it('a bad answer is retried once after the 20 s window, then the day closes with the spend of both attempts', async () => {
    const { a } = await couple(true)
    await a.client.rpc('pet_say_hi', { p_gesture: 'play' })
    const status = await statusOf(a.client)
    fake.reply(answer('Three Kangens — I counted.'))
    expect((await resolvePetNote({ admin: service as never, reader: a.client as never, status, now: noteNow() })).outcome).toBe('template')
    expect(await noteRow(status.pet_id)).toMatchObject({ status: 'pending', attempts: 1 })
    await new Promise((resolve) => setTimeout(resolve, 21_000))
    fake.reply(answer('I was lonely until you said hi.'))
    expect((await resolvePetNote({ admin: service as never, reader: a.client as never, status, now: noteNow() })).outcome).toBe('written_template')
    const row = await noteRow(status.pet_id)
    expect(row).toMatchObject({ status: 'ready', source: 'template', attempts: 2, output_tokens: 180, model: 'claude-sonnet-5-5' })
    expect(Number(row!.cost_usd)).toBe(0.0087)
    fake.reply(answer('Never sent.'))
    expect((await resolvePetNote({ admin: service as never, reader: a.client as never, status, now: noteNow() })).outcome).toBe('stored')
    expect(fake.requests).toHaveLength(2)
  }, 60_000)

  it('members cannot write notes; the route reads its own couple only', async () => {
    const { a } = await couple(true)
    const status = await statusOf(a.client)
    const { error } = await a.client.from('pet_daily_notes').insert({
      pet_id: status.pet_id, couple_id: status.couple_id, note_date: todayJakarta(), status: 'ready', source: 'ai', line: 'x',
    })
    expect(error).not.toBeNull()
    h.userClient = a.client
    const res = await todayGet()
    expect(res.status).toBe(200)
    expect((await res.json()).note).toMatchObject({ source: 'template' })
  })
})

// ---- Live (opt-in) -------------------------------------------------------------------------

describe.skipIf(!LIVE)('live Sonnet: one pet note (PET_LIVE=1)', () => {
  it('one real note, at most 300 output tokens, with its measured cost', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error('refusing to run: Supabase is not local')
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
    delete process.env.ANTHROPIC_BASE_URL
    const { createClient } = await import('@supabase/supabase-js')
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: couple, error } = await service.from('couples')
      .insert({ invite_code: `PET${Math.random().toString(36).slice(2, 9).toUpperCase()}` }).select('id').single()
    if (error) throw new Error(`couple insert: ${error.message}`)
    try {
      const digest = buildPetDigest({
        today: '2026-11-05', kind: 'daily', status: status(),
        members: [{ id: ME, name: 'Raka' }, { id: PARTNER, name: 'Dita' }],
        warmth: [{ source: 'moment', points: 10, created_at: ago(THURSDAY, HOUR) }, { source: 'kangen', points: 3, created_at: ago(THURSDAY, HOUR) }],
        moments: [{ title: 'Ramen in Blok M', created_at: ago(THURSDAY, HOUR) }],
        bucketDone: [], samakan: [], calendar: [],
      })
      const result = await generatePetNote(digest, couple.id as string, { maxTokens: 300 })
      const { data: usage } = await service.from('ai_usage')
        .select('feature, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd, outcome')
        .eq('couple_id', couple.id)
      // vitest does not always surface console output to a parent process: the
      // evidence also goes to PET_LIVE_OUT when set.
      const lines = [
        `[pet live] result: ${JSON.stringify(result.ok ? result.content : result)}`,
        `[pet live] usage: ${JSON.stringify(usage)}`,
      ]
      for (const line of lines) {
        console.log(line)
        if (process.env.PET_LIVE_OUT) appendFileSync(process.env.PET_LIVE_OUT, `${line}\n`)
      }
      expect(usage).toHaveLength(1)
      expect(result.ok || result.reason === 'rejected').toBe(true)
    } finally {
      await service.from('ai_usage').delete().eq('couple_id', couple.id)
      await service.from('couples').delete().eq('id', couple.id)
    }
  }, 60_000)
})
