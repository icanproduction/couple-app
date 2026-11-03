// Activity feed (F23), date-idea quota (F21) and realtime (F24) check against
// a LOCAL Supabase, plus the /api/ai/date-ideas guards on the local dev server.
//   node scripts/verify/feed-realtime.mjs        (APP_URL defaults to http://localhost:3030)
// Never calls the AI provider: the only route request that passes validation
// is made with the day's quota already used up (or, without LLM_API_KEY, is
// refused as "AI not enabled" before any claim). Prints "FEED-REALTIME VERIFY
// PASSED" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')

const env = {}
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_ ?? '')) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${URL_})`)
  process.exit(1)
}
const APP_URL = process.env.APP_URL ?? 'http://localhost:3030'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP_URL)) {
  console.error(`Refusing to run: APP_URL is not local (${APP_URL})`)
  process.exit(1)
}
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, ANON, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

const PASSWORD = 'verify-pass-123'
let pass = 0
const failures = []
const notes = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const created = []
const couples = []
const clients = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const todayJakarta = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function signUp(client, tag) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD })
  if (error || !data?.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  created.push(data.user.id)
  clients.push(client)
  // Realtime must carry the user's JWT so postgres_changes applies RLS as them.
  if (data.session) await client.realtime.setAuth(data.session.access_token)
  return { id: data.user.id, email }
}

async function kindsOf(client, cid) {
  const { data, error } = await client.from('activities').select('*').eq('couple_id', cid)
    .order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw new Error(`read activities: ${error.message}`)
  return data
}

/** Cookie header for a signed-in user, exactly as @supabase/ssr stores it. */
async function authCookie(email) {
  const jar = new Map()
  const server = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) value ? jar.set(name, value) : jar.delete(name) },
    },
  })
  const { error } = await server.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`cookie sign-in: ${error.message}`)
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
}

async function post(body, cookie, raw = false) {
  const res = await fetch(`${APP_URL}/api/ai/date-ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: raw ? body : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* not JSON */ }
  return { status: res.status, json }
}

/** Resolves when `pred` is true, or false after `ms`. */
async function waitFor(pred, ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (pred()) return true
    await sleep(50)
  }
  return pred()
}

function subscribe(client, name, coupleId, sink) {
  return new Promise((resolve, reject) => {
    const ch = client.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`)
    for (const table of ['activities', 'moments']) {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `couple_id=eq.${coupleId}` },
        (payload) => sink.push({ table, at: Date.now(), row: payload.new }))
    }
    const timer = setTimeout(() => reject(new Error(`${name}: subscribe timeout`)), 10_000)
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(ch) }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`${name}: ${status} ${err?.message ?? ''}`)) }
    })
  })
}

async function main() {
  const a = mk(), b = mk(), c = mk(), d = mk(), e = mk()
  const A = await signUp(a, 'fa'), B = await signUp(b, 'fb'), C = await signUp(c, 'fc'), D = await signUp(d, 'fd')
  const E = await signUp(e, 'fe') // no couple
  const { data: couple, error: cErr } = await a.rpc('create_couple')
  if (cErr) throw new Error(`create_couple: ${cErr.message}`)
  await b.rpc('join_couple', { p_code: couple.invite_code })
  const cid = couple.id
  couples.push(cid)
  const { data: couple2 } = await c.rpc('create_couple')
  await d.rpc('join_couple', { p_code: couple2.invite_code })
  const cid2 = couple2.id
  couples.push(cid2)

  // ============ Activity triggers ============
  const SECRET = `RAHASIA-${Math.random().toString(36).slice(2, 10)}`
  const today = todayJakarta()

  const { data: moment, error: mE } = await a.from('moments')
    .insert({ couple_id: cid, created_by: A.id, title: 'Piknik di Kebun Raya', moment_date: today }).select().single()
  ok('insert moment', !mE, mE?.message)
  const { error: comE } = await b.from('moment_comments').insert({ moment_id: moment.id, couple_id: cid, profile_id: B.id, body: `${SECRET}-comment` })
  ok('insert comment', !comE, comE?.message)
  const { error: reaE } = await b.from('moment_reactions').insert({ moment_id: moment.id, couple_id: cid, profile_id: B.id, emoji: '❤️' })
  ok('insert reaction', !reaE, reaE?.message)

  const { data: bucket, error: bE } = await a.from('bucket_items')
    .insert({ couple_id: cid, created_by: A.id, title: 'Naik balon udara' }).select().single()
  ok('insert bucket item', !bE, bE?.message)
  const { error: bDoneE } = await b.from('bucket_items').update({ is_done: true, done_at: new Date().toISOString() }).eq('id', bucket.id)
  ok('partner ticks bucket item', !bDoneE, bDoneE?.message)

  const { data: mood, error: moodE } = await a.from('mood_checkins')
    .insert({ couple_id: cid, profile_id: A.id, mood: 'senang', note: `${SECRET}-mood` }).select().single()
  ok('insert mood', !moodE, moodE?.message)
  await a.from('mood_checkins').update({ note: `${SECRET}-mood2` }).eq('id', mood.id) // same mood: no new row
  await a.from('mood_checkins').update({ mood: 'capek' }).eq('id', mood.id) // changed mood: new row

  const { error: gE } = await a.from('gratitude_notes').insert({ couple_id: cid, from_id: A.id, to_id: B.id, body: `${SECRET}-gratitude` })
  ok('insert gratitude', !gE, gE?.message)
  const { error: lE } = await a.from('letters').insert({
    couple_id: cid, sender_id: A.id, receiver_id: B.id, content: `${SECRET}-letter`,
    unlock_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  })
  ok('insert letter', !lE, lE?.message)
  const { error: evE } = await a.from('couple_events').insert({ couple_id: cid, created_by: A.id, title: 'Dinner anniversary', event_date: today, event_type: 'date_plan', event_scope: 'couple' })
  ok('insert couple event', !evE, evE?.message)
  const { error: pevE } = await a.from('couple_events').insert({ couple_id: cid, created_by: A.id, title: 'Dokter gigi', event_date: today, event_type: 'reminder', event_scope: 'personal' })
  ok('insert personal event', !pevE, pevE?.message)
  const { error: txE } = await a.from('couple_transactions').insert({ couple_id: cid, created_by: A.id, amount: 50000, type: 'deposit', category: 'tabungan' })
  ok('insert deposit', !txE, txE?.message)
  const { error: wdE } = await a.from('couple_transactions').insert({ couple_id: cid, created_by: A.id, amount: -20000, type: 'withdrawal', category: 'tabungan' })
  ok('insert withdrawal', !wdE, wdE?.message)
  const { error: dE } = await b.from('daily_responses').insert({ couple_id: cid, profile_id: B.id, question_index: 0, answer: `${SECRET}-answer`, answered_date: today })
  ok('insert daily answer', !dE, dE?.message)

  const acts = await kindsOf(b, cid)
  const count = (kind) => acts.filter((x) => x.kind === kind).length
  const expected = { moment: 1, comment: 1, reaction: 1, bucket_add: 1, bucket_done: 1, mood: 2, gratitude: 1, letter: 1, event: 1, saving: 2, daily: 1 }
  for (const [kind, n] of Object.entries(expected)) ok(`trigger ${kind} ×${n}`, count(kind) === n, `got ${count(kind)}`)
  ok('no unexpected activity kinds', acts.every((x) => x.kind in expected), acts.map((x) => x.kind).join(','))
  ok('personal event logs nothing', !acts.some((x) => x.summary.includes('Dokter gigi')))
  ok('no summary leaks private text', acts.every((x) => !x.summary.includes(SECRET)), acts.map((x) => x.summary).join(' | '))
  const byKind = (kind) => acts.find((x) => x.kind === kind)
  ok('moment activity: actor, ref, url', byKind('moment')?.actor_id === A.id && byKind('moment')?.ref_id === moment.id
    && byKind('moment')?.url === `/app/moments/${moment.id}` && byKind('moment')?.summary.includes('Piknik di Kebun Raya'))
  ok('bucket_done actor is the partner who ticked it', byKind('bucket_done')?.actor_id === B.id)
  ok('daily actor is the answerer', byKind('daily')?.actor_id === B.id)
  ok('deposit summary formatted', acts.some((x) => x.kind === 'saving' && x.summary === 'menabung Rp 50.000'), acts.filter((x) => x.kind === 'saving').map((x) => x.summary).join('|'))
  ok('withdrawal summary formatted', acts.some((x) => x.kind === 'saving' && x.summary === 'menarik Rp 20.000 dari tabungan'))
  ok('letter summary is metadata only', byKind('letter')?.summary === 'menulis surat rahasia')
  ok('gratitude summary is generic', byKind('gratitude')?.summary === 'menaruh apresiasi baru di toples')
  ok('mood summary has mood only', acts.filter((x) => x.kind === 'mood').map((x) => x.summary).join('|') === 'lagi merasa senang hari ini|lagi merasa capek hari ini')

  // ============ Activities are read-only for users ============
  const before = await kindsOf(admin, cid)
  const { error: insAct } = await a.from('activities').insert({ couple_id: cid, actor_id: A.id, kind: 'moment', summary: 'palsu' })
  ok('user cannot insert activity', !!insAct)
  const { data: updRows, error: updAct } = await a.from('activities').update({ summary: 'diubah' }).eq('couple_id', cid).select()
  ok('user cannot update activity', !!updAct || (updRows ?? []).length === 0)
  const { data: delRows, error: delAct } = await b.from('activities').delete().eq('couple_id', cid).select()
  ok('user cannot delete activity', !!delAct || (delRows ?? []).length === 0)
  const after = await kindsOf(admin, cid)
  ok('activities unchanged after write attempts', after.length === before.length && after.every((x, i) => x.summary === before[i].summary))
  const { data: cActs } = await c.from('activities').select('id').eq('couple_id', cid)
  ok('other couple cannot read activities', (cActs ?? []).length === 0)
  const { data: anonActs } = await mk().from('activities').select('id').eq('couple_id', cid)
  ok('anon cannot read activities', (anonActs ?? []).length === 0)

  // ============ activity_reads: own row only ============
  const newest = after[after.length - 1]
  const { error: aSeen } = await a.from('activity_reads').upsert({ profile_id: A.id, last_seen_at: newest.created_at }, { onConflict: 'profile_id' })
  ok('mark own seen', !aSeen, aSeen?.message)
  const { error: bSeen } = await b.from('activity_reads').upsert({ profile_id: B.id, last_seen_at: newest.created_at }, { onConflict: 'profile_id' })
  ok('partner marks own seen', !bSeen, bSeen?.message)
  const { error: forge } = await a.from('activity_reads').upsert({ profile_id: B.id, last_seen_at: '2000-01-01T00:00:00Z' }, { onConflict: 'profile_id' })
  ok('cannot write partner read marker', !!forge)
  const { data: forgeUpd } = await a.from('activity_reads').update({ last_seen_at: '2000-01-01T00:00:00Z' }).eq('profile_id', B.id).select()
  ok('cannot update partner read marker', (forgeUpd ?? []).length === 0)
  const { data: bRow } = await admin.from('activity_reads').select('last_seen_at').eq('profile_id', B.id).single()
  ok('partner marker untouched', Date.parse(bRow?.last_seen_at) === Date.parse(newest.created_at))
  const { data: aReads } = await a.from('activity_reads').select('profile_id')
  ok('reads only own marker', aReads?.length === 1 && aReads[0].profile_id === A.id, JSON.stringify(aReads))
  const { data: cReads } = await c.from('activity_reads').select('profile_id')
  ok('other couple sees no markers', (cReads ?? []).length === 0)

  // Unread count, same query as src/lib/activity.ts getUnreadCount
  const unread = async (client, me) => {
    const { data: seen } = await client.from('activity_reads').select('last_seen_at').eq('profile_id', me).maybeSingle()
    let q = client.from('activities').select('id', { count: 'exact', head: true }).eq('couple_id', cid).or(`actor_id.is.null,actor_id.neq.${me}`)
    if (seen?.last_seen_at) q = q.gt('created_at', seen.last_seen_at)
    const { count: n, error: uE } = await q
    if (uE) throw new Error(`unread: ${uE.message}`)
    return n
  }
  ok('unread starts at 0 after marking seen', (await unread(a, A.id)) === 0)
  await b.from('mood_checkins').insert({ couple_id: cid, profile_id: B.id, mood: 'kangen' })
  await a.from('bucket_items').insert({ couple_id: cid, created_by: A.id, title: 'Belajar masak bareng' })
  ok('partner activity counts as unread', (await unread(a, A.id)) === 1)
  ok('own activity is not unread for me', (await unread(b, B.id)) === 1)

  // Keyset pagination, same filter as src/lib/activity.ts fetchActivities
  const all = (await kindsOf(b, cid)).slice().reverse()
  const pageSize = 4
  const paged = []
  let cursor = null
  for (let guard = 0; guard < 20; guard++) {
    let q = b.from('activities').select('*').eq('couple_id', cid)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1)
    if (cursor) q = q.or(`created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt.${cursor.id})`)
    const { data: rows, error: pE } = await q
    if (pE) { failures.push(`pagination query: ${pE.message}`); break }
    paged.push(...rows.slice(0, pageSize))
    if (rows.length <= pageSize) break
    cursor = rows[pageSize - 1]
  }
  ok('keyset pagination returns every row once, in order', paged.map((x) => x.id).join() === all.map((x) => x.id).join(), `${paged.length}/${all.length}`)

  // ============ claim_date_idea_run ============
  const input = { budget: 'hemat', vibe: 'santai', setting: 'bebas', city: null }
  const { error: userClaim } = await a.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('authenticated user cannot claim quota', !!userClaim)
  const { error: anonClaim } = await mk().rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('anon cannot claim quota', !!anonClaim)
  const ids = []
  for (let i = 0; i < 5; i++) {
    const { data: id, error: clE } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
    if (clE) failures.push(`claim ${i}: ${clE.message}`)
    ids.push(id)
  }
  ok('5 claims return distinct ids', ids.every(Boolean) && new Set(ids).size === 5)
  const { data: sixth } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('6th claim returns null', sixth === null, String(sixth))
  await admin.from('ai_date_idea_runs').update({ status: 'failed' }).eq('id', ids[0])
  const { data: retry } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('failed run frees a slot', typeof retry === 'string' && !ids.includes(retry))
  const { data: again } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('quota full again after reuse', again === null)
  const { data: other } = await admin.rpc('claim_date_idea_run', { p_couple: cid2, p_profile: C.id, p_input: input, p_limit: 5 })
  ok('quota is per couple', typeof other === 'string')
  const { data: runRow } = await a.from('ai_date_idea_runs').select('status, input, profile_id').eq('id', retry).single()
  ok('run stores input + claimant, pending', runRow?.status === 'pending' && runRow?.input?.budget === 'hemat' && runRow?.profile_id === A.id)
  const { data: cRuns } = await c.from('ai_date_idea_runs').select('id').eq('couple_id', cid)
  ok('other couple cannot read runs', (cRuns ?? []).length === 0)
  const { error: runIns } = await a.from('ai_date_idea_runs').insert({ couple_id: cid, profile_id: A.id, status: 'done' })
  ok('user cannot insert runs', !!runIns)
  const { data: runUpd } = await a.from('ai_date_idea_runs').update({ status: 'failed' }).eq('id', retry).select()
  ok('user cannot free a slot by failing a run', (runUpd ?? []).length === 0)

  // R9: a run stuck in 'pending' for over 5 minutes stops holding a slot.
  const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString()
  await admin.from('ai_date_idea_runs').update({ created_at: minutesAgo(6) }).eq('id', ids[1])
  const { data: afterStale, error: staleE } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('pending run older than 5 min frees its slot', typeof afterStale === 'string', staleE?.message ?? String(afterStale))
  const { data: fullAgain } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
  ok('quota full again after the stale slot is reused', fullAgain === null, String(fullAgain))
  // A pending run a few minutes old still counts (skipped right after Jakarta
  // midnight, when 4 minutes ago was yesterday's quota).
  const jakartaNow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  const [jh, jm] = jakartaNow.split(':').map(Number)
  if (jh * 60 + jm >= 10) {
    await admin.from('ai_date_idea_runs').update({ created_at: minutesAgo(4) }).eq('id', ids[2])
    const { data: stillFull } = await admin.rpc('claim_date_idea_run', { p_couple: cid, p_profile: A.id, p_input: input, p_limit: 5 })
    ok('pending run 4 min old still holds its slot', stillFull === null, String(stillFull))
  } else {
    notes.push('skipped "pending run 4 min old" check: within 10 min of Jakarta midnight')
  }

  // ============ /api/ai/date-ideas guards (dev server) ============
  let reachable = true
  try { await fetch(APP_URL, { method: 'HEAD' }) } catch { reachable = false }
  if (!reachable) {
    notes.push(`route checks skipped: ${APP_URL} not reachable`)
  } else {
    const unauth = await post({ budget: 'hemat', vibe: 'santai', setting: 'bebas' })
    ok('route: unauthenticated → 401', unauth.status === 401, `status ${unauth.status}`)
    const cookieA = await authCookie(A.email)
    const malformed = await post('{not json', cookieA, true)
    ok('route: malformed JSON → 400', malformed.status === 400, `status ${malformed.status}`)
    const badBudget = await post({ budget: 'mahal', vibe: 'santai', setting: 'bebas' }, cookieA)
    ok('route: bad budget → 400', badBudget.status === 400, `status ${badBudget.status}`)
    const badVibe = await post({ budget: 'hemat', vibe: 'aneh', setting: 'bebas' }, cookieA)
    ok('route: bad vibe → 400', badVibe.status === 400, `status ${badVibe.status}`)
    const badCity = await post({ budget: 'hemat', vibe: 'santai', setting: 'bebas', city: 'Jakarta 123' }, cookieA)
    ok('route: city with digits → 400', badCity.status === 400, `status ${badCity.status}`)
    const longCity = await post({ budget: 'hemat', vibe: 'santai', setting: 'bebas', city: 'A'.repeat(41) }, cookieA)
    ok('route: city over 40 chars → 400', longCity.status === 400, `status ${longCity.status}`)
    const { count: runsBefore } = await admin.from('ai_date_idea_runs').select('id', { count: 'exact', head: true }).eq('couple_id', cid)
    const quota = await post({ budget: 'sedang', vibe: 'kuliner', setting: 'indoor', city: ' Bandung ' }, cookieA)
    // The dev server reads the same env files. Without LLM_API_KEY the route
    // answers 503 before claiming (the AI feature is off), so the 429 path can
    // only be reached with a key; it is also covered offline by `npm test`.
    if (env.LLM_API_KEY?.trim()) {
      ok('route: quota used up → 429 with message', quota.status === 429 && quota.json?.error === 'Kuota ide hari ini sudah habis, coba lagi besok',
        `status ${quota.status} ${JSON.stringify(quota.json)}`)
    } else {
      ok('route: no LLM_API_KEY → 503 "Fitur AI belum diaktifkan"', quota.status === 503 && quota.json?.error === 'Fitur AI belum diaktifkan',
        `status ${quota.status} ${JSON.stringify(quota.json)}`)
      notes.push('route quota → 429 check needs LLM_API_KEY in .env.local; checked the 503 "AI off" answer instead')
    }
    const { count: runsAfter } = await admin.from('ai_date_idea_runs').select('id', { count: 'exact', head: true }).eq('couple_id', cid)
    ok('route: refused request adds no run', runsAfter === runsBefore, `${runsBefore} → ${runsAfter}`)
    const cookieE = await authCookie(E.email)
    const noCouple = await post({ budget: 'hemat', vibe: 'santai', setting: 'bebas' }, cookieE)
    ok('route: no couple → 400', noCouple.status === 400, `status ${noCouple.status}`)
  }

  // ============ Realtime: partner receives, other couple doesn't ============
  const bGot = [], cForeign = [], cOwn = []
  const chans = await Promise.all([
    subscribe(b, 'partner', cid, bGot),
    subscribe(c, 'outsider-foreign', cid, cForeign),
    subscribe(c, 'outsider-own', cid2, cOwn),
  ])
  await sleep(1500)
  const t0 = Date.now()
  const { data: live, error: liveE } = await a.from('moments')
    .insert({ couple_id: cid, created_by: A.id, title: 'Realtime check', moment_date: today }).select().single()
  ok('insert realtime moment', !liveE, liveE?.message)
  const gotBoth = await waitFor(() =>
    bGot.some((x) => x.table === 'moments' && x.row.id === live?.id)
    && bGot.some((x) => x.table === 'activities' && x.row.ref_id === live?.id), 8000)
  ok('partner receives moment + activity INSERT live', gotBoth, JSON.stringify(bGot.map((x) => x.table)))
  if (gotBoth) notes.push(`realtime latency to partner: ${Math.max(...bGot.map((x) => x.at)) - t0} ms`)
  const { data: own } = await d.from('moments')
    .insert({ couple_id: cid2, created_by: D.id, title: 'Control', moment_date: today }).select().single()
  const controlOk = await waitFor(() => cOwn.some((x) => x.table === 'moments' && x.row.id === own?.id), 8000)
  ok('outsider channel is live (own couple event arrives)', controlOk)
  await sleep(1500)
  ok('outsider receives nothing for the other couple', cForeign.length === 0, `${cForeign.length} events`)
  ok('partner receives nothing from the other couple', !bGot.some((x) => x.row.couple_id === cid2))
  for (const ch of chans) await ch.unsubscribe()

  // ============ R8: deleting something removes its feed lines ============
  const actsFor = async (refId) => {
    const { count: n } = await admin.from('activities').select('id', { count: 'exact', head: true }).eq('couple_id', cid).eq('ref_id', refId)
    return n ?? 0
  }
  /** Delete as the user where RLS lets them (as the app does), else with the service role. */
  const remove = async (client, table, id) => {
    await client.from(table).delete().eq('id', id)
    const { data: still } = await admin.from(table).select('id').eq('id', id).maybeSingle()
    if (still) await admin.from(table).delete().eq('id', id)
    const { data: gone } = await admin.from(table).select('id').eq('id', id).maybeSingle()
    return !gone
  }
  const firstId = async (table, filter) => {
    const { data } = await admin.from(table).select('id').eq('couple_id', cid).match(filter).limit(1).maybeSingle()
    return data?.id
  }
  const targets = [
    ['moments', a, moment.id, 3, 'moment + comment + reaction'],
    ['bucket_items', a, bucket.id, 2, 'bucket_add + bucket_done'],
    ['mood_checkins', a, mood.id, 2, 'two mood lines'],
    ['gratitude_notes', a, await firstId('gratitude_notes', { from_id: A.id }), 1, 'gratitude'],
    ['letters', a, await firstId('letters', { sender_id: A.id }), 1, 'letter'],
    ['couple_events', a, await firstId('couple_events', { title: 'Dinner anniversary' }), 1, 'event'],
    ['couple_transactions', a, await firstId('couple_transactions', { amount: 50000 }), 1, 'deposit'],
  ]
  const dailyBefore = (await kindsOf(admin, cid)).filter((x) => x.kind === 'daily').length
  for (const [table, client, id, expectedLines, what] of targets) {
    const before = await actsFor(id)
    ok(`R8 ${table}: feed has its lines first (${what})`, !!id && before === expectedLines, `id=${id} lines=${before}`)
    const deleted = await remove(client, table, id)
    ok(`R8 ${table}: row deleted`, deleted)
    ok(`R8 ${table}: its feed lines are gone`, (await actsFor(id)) === 0, `left ${await actsFor(id)}`)
  }
  const afterAll = await kindsOf(admin, cid)
  ok('R8: unrelated feed lines stay (daily answer)', afterAll.filter((x) => x.kind === 'daily').length === dailyBefore && dailyBefore === 1)
  ok("R8: other couple's feed untouched", (await kindsOf(admin, cid2)).some((x) => x.kind === 'moment'))
}

try { await main() } catch (err) { failures.push(`crash: ${err.message}`) }
finally {
  for (const client of clients) client.removeAllChannels?.()
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const n of notes) console.log(`NOTE ${n}`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('FEED-REALTIME VERIFY PASSED')
process.exit(0)
