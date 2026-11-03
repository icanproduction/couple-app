// Account & couple (F01–F05) check against a LOCAL Supabase + the local dev
// server (default http://localhost:3030, override with VERIFY_APP_URL).
//   node scripts/verify/account.mjs
// Prints "ACCOUNT VERIFY PASSED" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const APP = process.env.VERIFY_APP_URL ?? 'http://localhost:3030'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error(`Refusing to run: VERIFY_APP_URL is not local (${APP})`)
  process.exit(1)
}
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, ANON, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

const { inQuietHours, hourLabel, isPushMuted } = await import(pathToFileURL(join(root, 'src', 'lib', 'quiet-hours.ts')).href)

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const created = []
const couples = new Set()
const uploaded = [] // [bucket, path]
async function signUp(client, tag) {
  const { data, error } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (error || !data?.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  created.push(data.user.id)
  await client.from('profiles').update({ name: tag.toUpperCase() }).eq('id', data.user.id)
  return data.user.id
}
async function newCouple(client) {
  const { data, error } = await client.rpc('create_couple')
  if (error) throw new Error(`create_couple: ${error.message}`)
  couples.add(data.id)
  return data
}
const jpeg = new Blob([readFileSync(join(here, 'fixtures', 'moment-gps.jpg'))], { type: 'image/jpeg' })
const DAY = 24 * 3600 * 1000
const daysAhead = (iso) => (new Date(iso).getTime() - Date.now()) / DAY

/** Session cookies exactly as the app's @supabase/ssr server client reads them. */
async function cookieFor(client) {
  const { data: { session } } = await client.auth.getSession()
  const jar = new Map()
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) { if (value) jar.set(name, value); else jar.delete(name) } },
    },
  })
  const { error } = await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (error) throw new Error(`setSession: ${error.message}`)
  for (let i = 0; i < 20 && jar.size === 0; i++) await new Promise((r) => setTimeout(r, 25))
  if (jar.size === 0) throw new Error('no auth cookie produced')
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
}
async function api(method, path, cookie, body) {
  const res = await fetch(APP + path, {
    method,
    redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers }
}
async function uploadMomentPhoto(client, cid, uid) {
  const { data: m, error } = await client.from('moments').insert({ couple_id: cid, created_by: uid, title: 'Verify moment', moment_date: '2026-10-01' }).select().single()
  if (error) throw new Error(`moment insert: ${error.message}`)
  const path = `${cid}/${m.id}/p0.jpg`
  const { error: upE } = await client.storage.from('moments').upload(path, jpeg, { contentType: 'image/jpeg' })
  const { error: rowE } = await client.from('moment_photos').insert({ moment_id: m.id, couple_id: cid, storage_path: path, sort_order: 0 })
  if (upE || rowE) throw new Error(`photo: ${upE?.message ?? rowE?.message}`)
  uploaded.push(['moments', path])
  return { momentId: m.id, path }
}
async function listFolder(bucket, prefix) {
  const { data } = await admin.storage.from(bucket).list(prefix)
  return data ?? []
}

function quietHourCases() {
  const at = (iso) => new Date(iso) // UTC; WIB = UTC+7
  ok('quiet: none set', inQuietHours(null, null, at('2026-10-27T16:00:00Z')) === false)
  ok('quiet: equal hours = off', inQuietHours(5, 5, at('2026-10-27T22:00:00Z')) === false)
  ok('quiet 22–6: 22.00 WIB quiet', inQuietHours(22, 6, at('2026-10-27T15:00:00Z')) === true)
  ok('quiet 22–6: 23.59 WIB quiet', inQuietHours(22, 6, at('2026-10-27T16:59:00Z')) === true)
  ok('quiet 22–6: 00.00 WIB quiet (wraps midnight)', inQuietHours(22, 6, at('2026-10-27T17:00:00Z')) === true)
  ok('quiet 22–6: 05.30 WIB quiet', inQuietHours(22, 6, at('2026-10-27T22:30:00Z')) === true)
  ok('quiet 22–6: 06.00 WIB not quiet', inQuietHours(22, 6, at('2026-10-27T23:00:00Z')) === false)
  ok('quiet 22–6: 21.59 WIB not quiet', inQuietHours(22, 6, at('2026-10-27T14:59:00Z')) === false)
  ok('quiet 22–6: 12.00 WIB not quiet', inQuietHours(22, 6, at('2026-10-27T05:00:00Z')) === false)
  ok('quiet 9–17: 12.00 WIB quiet', inQuietHours(9, 17, at('2026-10-27T05:00:00Z')) === true)
  ok('quiet 9–17: 17.00 WIB not quiet (end exclusive)', inQuietHours(9, 17, at('2026-10-27T10:00:00Z')) === false)
  ok('quiet 9–17: 08.59 WIB not quiet', inQuietHours(9, 17, at('2026-10-27T01:59:00Z')) === false)
  ok('quiet 23–0: 23.30 WIB quiet', inQuietHours(23, 0, at('2026-10-27T16:30:00Z')) === true)
  ok('quiet 23–0: 00.00 WIB not quiet', inQuietHours(23, 0, at('2026-10-27T17:00:00Z')) === false)
  ok('quiet 0–1: midnight WIB is hour 0', inQuietHours(0, 1, at('2026-10-27T17:00:00Z')) === true)
  ok('hourLabel', hourLabel(7) === '07:00' && hourLabel(22) === '22:00')

  // R5: cron pushes ignore quiet hours, never the per-kind switch.
  const night = at('2026-10-27T16:00:00Z') // 23.00 WIB
  const prefs = { kangen: true, letters: true, moments: true, reminders: true, activity: true, quiet_start: 22, quiet_end: 6 }
  ok('mute: quiet hours hold back a normal push', isPushMuted(prefs, 'kangen', {}, night) === true)
  ok('mute: ignoreQuietHours delivers during quiet hours', isPushMuted(prefs, 'reminders', { ignoreQuietHours: true }, night) === false)
  ok('mute: ignoreQuietHours still respects the kind switch', isPushMuted({ ...prefs, reminders: false }, 'reminders', { ignoreQuietHours: true }, night) === true)
  ok('mute: letters switch off mutes letter unlocks', isPushMuted({ ...prefs, letters: false, quiet_start: null, quiet_end: null }, 'letters', { ignoreQuietHours: true }, night) === true)
  ok('mute: admin push ignores switches but not quiet hours', isPushMuted({ ...prefs, activity: false }, 'admin', {}, night) === true
    && isPushMuted({ ...prefs, activity: false, quiet_start: null, quiet_end: null }, 'admin', {}, night) === false)
  ok('mute: no prefs row → never muted', isPushMuted(null, 'kangen', {}, night) === false)
  ok('mute: outside quiet hours → delivered', isPushMuted(prefs, 'kangen', {}, at('2026-10-27T05:00:00Z')) === false)
  for (const [route, kind] of [['event-reminders', 'reminders'], ['letter-unlocks', 'letters']]) {
    const src = readFileSync(join(root, 'src', 'app', 'api', 'cron', route, 'route.ts'), 'utf8')
    ok(`cron ${route} sends '${kind}' with ignoreQuietHours`, new RegExp(`'${kind}',\\s*\\{\\s*ignoreQuietHours:\\s*true\\s*\\}`).test(src))
  }
}

async function inviteCodes() {
  const a = mk(), b = mk(), loner = mk()
  const aid = await signUp(a, 'ia'), bid = await signUp(b, 'ib')
  await signUp(loner, 'il')

  const c0 = await newCouple(a)
  ok('new couple: code valid ~7 days', Math.abs(daysAhead(c0.invite_expires_at) - 7) < 0.01, c0.invite_expires_at)

  const { data: r1, error: r1E } = await a.rpc('regenerate_invite_code')
  ok('regenerate while alone works', !r1E && r1?.invite_code && r1.invite_code !== c0.invite_code, r1E?.message)
  ok('regenerate gives 7 more days', r1 && Math.abs(daysAhead(r1.invite_expires_at) - 7) < 0.01)

  await admin.from('couples').update({ invite_expires_at: new Date(Date.now() - 3600_000).toISOString() }).eq('id', c0.id)
  const { error: expE } = await b.rpc('join_couple', { p_code: r1.invite_code })
  ok('expired code: join refused with the expired message', /invite code has expired/i.test(expE?.message ?? ''), expE?.message)
  const { count: stillOne } = await admin.from('couple_members').select('*', { count: 'exact', head: true }).eq('couple_id', c0.id)
  ok('expired code: nobody joined', stillOne === 1, `members=${stillOne}`)

  // /invite/<code> explains instead of bouncing to sign-up.
  const page = await api('GET', `/invite/${r1.invite_code}`)
  ok('/invite/<expired> renders the expired page', page.status === 200 && /invite code has expired/i.test(page.text), `status ${page.status}`)
  const missing = await api('GET', '/invite/ZZZZ9999')
  ok('/invite/<unknown> renders the not-found page', missing.status === 200 && /find this invite code/i.test(missing.text), `status ${missing.status}`)

  // create_couple on a waiting couple with an expired code refreshes it.
  const { data: refreshed } = await a.rpc('create_couple')
  ok('create_couple refreshes an expired waiting code', refreshed?.id === c0.id && refreshed.invite_code !== r1.invite_code && daysAhead(refreshed.invite_expires_at) > 6.9)

  const fresh = await api('GET', `/invite/${refreshed.invite_code}`)
  ok('/invite/<valid> still redirects to sign-up', [302, 303, 307, 308].includes(fresh.status) && /\/auth\/signup\?invite=/.test(fresh.headers.get('location') ?? ''), `status ${fresh.status} ${fresh.headers.get('location')}`)

  const { error: joinE } = await b.rpc('join_couple', { p_code: refreshed.invite_code })
  ok('fresh code: partner joins', !joinE, joinE?.message)
  const { error: fullE } = await a.rpc('regenerate_invite_code')
  ok('regenerate refused once full', /partner is already connected/i.test(fullE?.message ?? ''), fullE?.message)
  const { error: fullE2 } = await b.rpc('regenerate_invite_code')
  ok('regenerate refused for the joiner too', !!fullE2)
  const { error: noneE } = await loner.rpc('regenerate_invite_code')
  ok('regenerate refused without a couple', /not connected with a partner yet/i.test(noneE?.message ?? ''), noneE?.message)
  return { a, b, aid, bid, cid: c0.id }
}

async function leaveWithPartner({ a, b, aid, bid, cid }) {
  const { data: moment } = await a.from('moments').insert({ couple_id: cid, created_by: aid, title: 'Kencan pertama', moment_date: '2026-09-01' }).select().single()
  const { data: goal } = await a.from('savings_goals').insert({ couple_id: cid, name: 'Liburan', target_amount: 1000000 }).select().single()
  const { data: tx, error: txE } = await a.from('couple_transactions').insert({ couple_id: cid, goal_id: goal.id, amount: 50000, type: 'deposit', created_by: aid }).select().single()
  const { data: ev, error: evE } = await a.from('couple_events').insert({ couple_id: cid, title: 'Dinner', event_date: '2026-12-01', event_type: 'date', created_by: aid }).select().single()
  ok('setup shared data', moment?.id && tx?.id && ev?.id, txE?.message ?? evE?.message)
  // The leaver's own test results and a letter between the two of them.
  const results = {
    assessment: await a.from('assessment_results').insert({ profile_id: aid, couple_id: cid, answers: {}, scores: {} }).select('id').single(),
    mbti: await a.from('mbti_results').insert({ profile_id: aid, couple_id: cid, mbti_type: 'ENFP', answers: {}, scores: {} }).select('id').single(),
    spending: await a.from('spending_results').insert({ profile_id: aid, couple_id: cid, spending_type: 'saver', scores: {}, answers: {} }).select('id').single(),
  }
  ok('setup leaver test results', Object.values(results).every((r) => !r.error && r.data?.id), Object.values(results).map((r) => r.error?.message).join(' '))
  const { data: letter, error: letterE } = await a.from('letters').insert({ couple_id: cid, sender_id: aid, receiver_id: bid, content: 'surat-arsip', unlock_date: new Date(Date.now() - 60_000).toISOString() }).select('id').single()
  ok('setup letter', !letterE, letterE?.message)
  const { data: bSpendBefore } = await b.from('spending_results').select('id').eq('profile_id', aid)
  ok('partner can read my spending result while together', bSpendBefore?.length === 1)

  const { data: before } = await admin.from('couples').select('invite_code').eq('id', cid).single()

  const { data: res, error } = await a.rpc('leave_couple')
  ok('leave with partner: not deleted', !error && res?.deleted === false && res?.couple_id === cid, error?.message ?? JSON.stringify(res))
  const { data: after } = await admin.from('couples').select('invite_code, invite_expires_at, closed_at').eq('id', cid).maybeSingle()
  ok('couple survives', !!after)

  // R1: the couple is closed for good — no new code, nobody can join it.
  ok('couple is closed (closed_at set)', !!after?.closed_at)
  // Compare with closed_at (same transaction) rather than the host clock: the
  // DB runs in a VM whose clock can be a few ms ahead, which made this flaky.
  ok('invite code expired on leave, no fresh code',
    after && after.invite_code === before.invite_code &&
    new Date(after.invite_expires_at).getTime() <= new Date(after.closed_at).getTime(),
    JSON.stringify({ before: before.invite_code, ...after }))
  const { error: regenClosedE } = await b.rpc('regenerate_invite_code')
  ok('regenerate refused for a closed couple', /was closed when your partner left/i.test(regenClosedE?.message ?? ''), regenClosedE?.message)
  const { data: recreated, error: recreateE } = await b.rpc('create_couple')
  ok('create_couple returns the closed couple unchanged', !recreateE && recreated?.id === cid && !!recreated.closed_at
    && recreated.invite_code === before.invite_code
    && recreated.invite_expires_at === after.invite_expires_at, recreateE?.message ?? JSON.stringify(recreated))
  const { error: rejoinE } = await a.rpc('join_couple', { p_code: before.invite_code })
  ok('leaver cannot rejoin a closed couple', /couple has been closed/i.test(rejoinE?.message ?? ''), rejoinE?.message)
  const x = mk()
  const xid = await signUp(x, 'ix')
  const { error: strangerE } = await x.rpc('join_couple', { p_code: before.invite_code })
  ok('nobody new can join a closed couple', /couple has been closed/i.test(strangerE?.message ?? ''), strangerE?.message)
  const { count: stillOneMember } = await admin.from('couple_members').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  ok('closed couple still has only the remaining partner', stillOneMember === 1, `members=${stillOneMember}`)
  const closedPage = await api('GET', `/invite/${before.invite_code}`)
  ok('/invite/<closed> explains the space was closed', closedPage.status === 200 && /was closed when one of them left/i.test(closedPage.text) && !/expired/i.test(closedPage.text), `status ${closedPage.status}`)
  const aCookie = await cookieFor(a)
  const apiRejoin = await api('POST', '/api/couple/join', aCookie, { code: before.invite_code })
  ok('API join of a closed code → 400 with message', apiRejoin.status === 400 && /couple has been closed/i.test(apiRejoin.json?.error ?? ''), `status ${apiRejoin.status} ${apiRejoin.text.slice(0, 120)}`)

  // R1: the leaver's results leave with them.
  for (const [table, r] of [['assessment_results', results.assessment], ['mbti_results', results.mbti], ['spending_results', results.spending]]) {
    const { data: row } = await admin.from(table).select('couple_id, profile_id').eq('id', r.data?.id).maybeSingle()
    ok(`leaver's ${table} kept, detached from the couple`, row?.profile_id === aid && row.couple_id === null, JSON.stringify(row))
  }
  const { data: bSpendAfter } = await b.from('spending_results').select('id').eq('profile_id', aid)
  ok("partner no longer reads the leaver's spending result", (bSpendAfter ?? []).length === 0)
  const { data: aOwnSpend } = await a.from('spending_results').select('id').eq('profile_id', aid)
  ok('leaver still reads own spending result', aOwnSpend?.length === 1)

  // R1: letters are readable only by their sender and receiver, even for
  // someone who got into the couple some other way.
  const { data: bLetters } = await b.from('letters').select('id').eq('couple_id', cid)
  ok('remaining partner still sees the letter they received', bLetters?.some((l) => l.id === letter?.id))
  const { error: plantE } = await admin.from('couple_members').insert({ couple_id: cid, profile_id: xid })
  ok('setup: plant a third person into the closed couple (service role)', !plantE, plantE?.message)
  const { data: xLetters } = await x.from('letters').select('id').eq('couple_id', cid)
  ok('a member who is not sender/receiver cannot list letters', (xLetters ?? []).length === 0, `saw ${xLetters?.length}`)
  const { error: xReadE } = await x.rpc('read_letter', { p_letter_id: letter?.id })
  ok('…nor read one through read_letter', /letter not found/i.test(xReadE?.message ?? ''), xReadE?.message)
  await admin.from('couple_members').delete().eq('couple_id', cid).eq('profile_id', xid)

  // A closed couple counts as "has data": joining elsewhere needs discard.
  const y = mk()
  await signUp(y, 'iy')
  const target = await newCouple(y)
  const { error: closedJoinE } = await b.rpc('join_couple', { p_code: target.invite_code })
  ok('member of a closed couple must confirm before joining elsewhere', closedJoinE?.hint === 'COUPLE_HAS_DATA', closedJoinE?.message)

  const { data: bMoments } = await b.from('moments').select('id').eq('couple_id', cid)
  ok('partner keeps moments', bMoments?.some((m) => m.id === moment.id))
  const { data: bTx } = await b.from('couple_transactions').select('id, created_by').eq('id', tx.id)
  ok('partner keeps transactions (author intact)', bTx?.[0]?.created_by === aid)
  const { data: bGoal } = await b.from('savings_goals').select('current_amount').eq('id', goal.id).single()
  ok('savings balance unchanged', Number(bGoal?.current_amount) === 50000, `balance ${bGoal?.current_amount}`)
  const { data: bEv } = await b.from('couple_events').select('id').eq('id', ev.id)
  ok('partner keeps events', bEv?.length === 1)
  const { data: acts } = await b.from('activities').select('kind, actor_id').eq('couple_id', cid).eq('kind', 'left')
  ok("activity row 'left' visible to partner", acts?.length === 1 && acts[0].actor_id === aid)

  const { data: aMoments } = await a.from('moments').select('id').eq('couple_id', cid)
  ok('leaver no longer sees couple data', (aMoments ?? []).length === 0)
  const { data: aMember } = await a.from('couple_members').select('couple_id').eq('profile_id', aid).maybeSingle()
  ok('leaver has no couple', !aMember)
  const { error: againE } = await a.rpc('leave_couple')
  ok('leaving twice is refused', /not connected with a partner yet/i.test(againE?.message ?? ''), againE?.message)

  // Last member leaving deletes the couple and its rows.
  const { data: last, error: lastE } = await b.rpc('leave_couple')
  ok('last member leaving: deleted', !lastE && last?.deleted === true, lastE?.message ?? JSON.stringify(last))
  const { data: gone } = await admin.from('couples').select('id').eq('id', cid).maybeSingle()
  ok('couple row gone', !gone)
  const { count: momentsLeft } = await admin.from('moments').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  const { count: txLeft } = await admin.from('couple_transactions').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  ok('couple data cascaded', momentsLeft === 0 && txLeft === 0, `moments ${momentsLeft}, tx ${txLeft}`)
}

async function creatorDeletion() {
  const c = mk(), d = mk()
  const cid_ = await signUp(c, 'dc'), did = await signUp(d, 'dd')
  const couple = await newCouple(c)
  await d.rpc('join_couple', { p_code: couple.invite_code })
  const { data: goal } = await c.from('savings_goals').insert({ couple_id: couple.id, name: 'Rumah', target_amount: 5000000 }).select().single()
  const { data: tx } = await c.from('couple_transactions').insert({ couple_id: couple.id, goal_id: goal.id, amount: 75000, type: 'deposit', created_by: cid_ }).select().single()
  const { data: moment } = await c.from('moments').insert({ couple_id: couple.id, created_by: cid_, title: 'Pantai', moment_date: '2026-08-01' }).select().single()
  // R10: a game the creator started and a pet care log they made.
  const { data: game, error: gameE } = await c.from('game_sessions').insert({ couple_id: couple.id, created_by: cid_, partner_id: did, chapter_id: 'hari-pertama', round_types: ['a'], rounds: [] }).select('id').single()
  const { data: pet } = await c.from('couple_pets').insert({ couple_id: couple.id, pet_type: 'cat', name: 'Mochi' }).select('id').single()
  await c.from('pet_mood_state').insert({ pet_id: pet?.id, updated_at: new Date().toISOString() })
  await c.from('pet_care_roles').insert({ couple_id: couple.id, pet_id: pet?.id, profile_id: cid_, actions: ['feed'] })
  const { error: careE } = await c.rpc('perform_pet_care', { p_pet_id: pet?.id, p_action: 'feed' })
  const { data: careLog } = await admin.from('pet_care_logs').select('id, done_by').eq('pet_id', pet?.id).maybeSingle()
  ok('setup game session + pet care log', !gameE && !careE && careLog?.done_by === cid_, gameE?.message ?? careE?.message)

  const { error: delE } = await admin.auth.admin.deleteUser(cid_)
  ok('admin deletes creator', !delE, delE?.message)
  const { data: kept } = await admin.from('couples').select('id, created_by').eq('id', couple.id).maybeSingle()
  ok('couple kept after creator deleted (created_by null)', kept?.id === couple.id && kept.created_by === null)
  const { data: keptTx } = await admin.from('couple_transactions').select('id, created_by, amount').eq('id', tx.id).maybeSingle()
  ok('transaction kept (created_by null)', keptTx?.id === tx.id && keptTx.created_by === null)
  const { data: keptGoal } = await d.from('savings_goals').select('current_amount').eq('id', goal.id).single()
  ok('balance unchanged after deletion', Number(keptGoal?.current_amount) === 75000, `balance ${keptGoal?.current_amount}`)
  const { data: keptMoment } = await d.from('moments').select('id, created_by').eq('id', moment.id).maybeSingle()
  ok('partner still sees moment', keptMoment?.id === moment.id && keptMoment.created_by === null)
  const { data: members } = await admin.from('couple_members').select('profile_id').eq('couple_id', couple.id)
  ok('partner still a member', members?.length === 1 && members[0].profile_id === did)
  const { data: keptGame } = await d.from('game_sessions').select('id, created_by').eq('id', game?.id).maybeSingle()
  ok('partner keeps the game session (created_by null)', keptGame?.id === game?.id && keptGame.created_by === null, JSON.stringify(keptGame))
  const { data: keptLog } = await d.from('pet_care_logs').select('id, done_by').eq('id', careLog?.id).maybeSingle()
  ok('partner keeps the pet care log (done_by null)', keptLog?.id === careLog?.id && keptLog.done_by === null, JSON.stringify(keptLog))
}

async function notificationPrefs() {
  const o = mk(), x = mk()
  const oid = await signUp(o, 'no')
  await signUp(x, 'nx')
  const { error: upE } = await o.from('notification_prefs').upsert({ profile_id: oid, kangen: false, quiet_start: 22, quiet_end: 6 }, { onConflict: 'profile_id' })
  ok('owner upserts prefs', !upE, upE?.message)
  const { data: own } = await o.from('notification_prefs').select('kangen, letters, quiet_start, quiet_end').eq('profile_id', oid).maybeSingle()
  ok('owner reads prefs', own?.kangen === false && own.letters === true && own.quiet_start === 22 && own.quiet_end === 6)
  const { error: up2E } = await o.from('notification_prefs').upsert({ profile_id: oid, kangen: true, quiet_start: null, quiet_end: null }, { onConflict: 'profile_id' })
  ok('owner updates prefs', !up2E, up2E?.message)

  const { data: peek } = await x.from('notification_prefs').select('*').eq('profile_id', oid)
  ok('other user cannot read prefs', (peek ?? []).length === 0)
  const { error: forgeE } = await x.from('notification_prefs').insert({ profile_id: oid, kangen: false })
  ok('other user cannot insert prefs for someone else', !!forgeE)
  await x.from('notification_prefs').update({ kangen: false }).eq('profile_id', oid)
  await x.from('notification_prefs').delete().eq('profile_id', oid)
  const { data: still } = await admin.from('notification_prefs').select('kangen').eq('profile_id', oid).maybeSingle()
  ok('other user cannot update/delete prefs', still?.kangen === true)
  const { data: anonPeek } = await mk().from('notification_prefs').select('*').eq('profile_id', oid)
  ok('anon cannot read prefs', (anonPeek ?? []).length === 0)

  const { error: sameE } = await o.from('notification_prefs').update({ quiet_start: 5, quiet_end: 5 }).eq('profile_id', oid)
  ok('quiet start = end rejected', !!sameE)
  const { error: halfE } = await o.from('notification_prefs').update({ quiet_start: 5 }).eq('profile_id', oid)
  ok('quiet start without end rejected', !!halfE)
}

/** R3/R7: joining never silently deletes a couple that holds memories. */
async function joinWithData() {
  const ping = await fetch(APP).catch(() => null)
  if (!ping) { failures.push(`dev server not reachable at ${APP}`); return }

  const unauth = await api('POST', '/api/couple/join', null, { code: 'ABCD2345' })
  ok('POST /api/couple/join unauthenticated → 401', unauth.status === 401, `status ${unauth.status}`)

  // J waits alone in a couple that already holds a moment with a photo.
  const j = mk(), k = mk()
  const jid = await signUp(j, 'jj')
  await signUp(k, 'jk')
  const own = await newCouple(j)
  const photo = await uploadMomentPhoto(j, own.id, jid)
  const target = await newCouple(k)

  const { error: rpcE } = await j.rpc('join_couple', { p_code: target.invite_code })
  ok('join_couple refuses with hint COUPLE_HAS_DATA', rpcE?.hint === 'COUPLE_HAS_DATA', `${rpcE?.message} hint=${rpcE?.hint}`)
  const { data: jMem } = await admin.from('couple_members').select('couple_id').eq('profile_id', jid).maybeSingle()
  ok('…and nothing changed', jMem?.couple_id === own.id)

  const jCookie = await cookieFor(j)
  const noCode = await api('POST', '/api/couple/join', jCookie, {})
  ok('API join without a code → 400', noCode.status === 400, `status ${noCode.status}`)
  const badDiscard = await api('POST', '/api/couple/join', jCookie, { code: target.invite_code, discard: 'ya' })
  ok('API join with a non-boolean discard → 400', badDiscard.status === 400, `status ${badDiscard.status}`)
  const unknown = await api('POST', '/api/couple/join', jCookie, { code: 'ZZZZ9999' })
  ok('API join with an unknown code → 400 not found', unknown.status === 400 && /invite code not found/i.test(unknown.json?.error ?? ''), `status ${unknown.status}`)

  const first = await api('POST', '/api/couple/join', jCookie, { code: target.invite_code })
  ok('API join over data → 409 COUPLE_HAS_DATA', first.status === 409 && first.json?.code === 'COUPLE_HAS_DATA' && typeof first.json?.error === 'string', `status ${first.status} ${first.text.slice(0, 160)}`)
  const { data: ownStill } = await admin.from('couples').select('id').eq('id', own.id).maybeSingle()
  ok('…old couple and photo untouched', !!ownStill && (await listFolder('moments', `${own.id}/${photo.momentId}`)).length === 1)

  const confirmed = await api('POST', '/api/couple/join', jCookie, { code: target.invite_code.toLowerCase(), discard: true })
  ok('API join with discard → 200 into the target couple', confirmed.status === 200 && confirmed.json?.coupleId === target.id && confirmed.json?.discarded === true, `status ${confirmed.status} ${confirmed.text.slice(0, 160)}`)
  const { data: ownGone } = await admin.from('couples').select('id').eq('id', own.id).maybeSingle()
  ok('discarded couple deleted', !ownGone)
  ok('discarded couple photos removed from storage', (await listFolder('moments', `${own.id}/${photo.momentId}`)).length === 0 && (await listFolder('moments', own.id)).length === 0)
  const { count: targetMembers } = await admin.from('couple_members').select('*', { count: 'exact', head: true }).eq('couple_id', target.id)
  ok('joiner is now in the target couple', targetMembers === 2, `members=${targetMembers}`)
  const again = await api('POST', '/api/couple/join', jCookie, { code: target.invite_code })
  ok('joining the couple you are in → 200, same couple', again.status === 200 && again.json?.coupleId === target.id, `status ${again.status}`)

  // An empty waiting couple is replaced without asking.
  const l = mk(), m = mk()
  const lid = await signUp(l, 'jl')
  await signUp(m, 'jm')
  const empty = await newCouple(l)
  const mCouple = await newCouple(m)
  const quiet = await api('POST', '/api/couple/join', await cookieFor(l), { code: mCouple.invite_code })
  ok('API join from an empty couple → 200 without confirmation', quiet.status === 200 && quiet.json?.coupleId === mCouple.id, `status ${quiet.status} ${quiet.text.slice(0, 160)}`)
  const { data: emptyGone } = await admin.from('couples').select('id').eq('id', empty.id).maybeSingle()
  const { data: lMem } = await admin.from('couple_members').select('couple_id').eq('profile_id', lid).maybeSingle()
  ok('…the empty couple is gone, joiner moved', !emptyGone && lMem?.couple_id === mCouple.id)

  // A closed couple with no other data still needs the confirmation.
  const p = mk(), q = mk(), r = mk()
  await signUp(p, 'jp')
  const qid = await signUp(q, 'jq')
  await signUp(r, 'jr')
  const pq = await newCouple(p)
  await q.rpc('join_couple', { p_code: pq.invite_code })
  await p.rpc('leave_couple')
  const rCouple = await newCouple(r)
  const qCookie = await cookieFor(q)
  const closedFirst = await api('POST', '/api/couple/join', qCookie, { code: rCouple.invite_code })
  ok('API join from a closed (empty) couple → 409', closedFirst.status === 409 && closedFirst.json?.code === 'COUPLE_HAS_DATA', `status ${closedFirst.status}`)
  const closedConfirmed = await api('POST', '/api/couple/join', qCookie, { code: rCouple.invite_code, discard: true })
  ok('…with discard → 200', closedConfirmed.status === 200 && closedConfirmed.json?.coupleId === rCouple.id, `status ${closedConfirmed.status} ${closedConfirmed.text.slice(0, 160)}`)
  const { data: pqGone } = await admin.from('couples').select('id').eq('id', pq.id).maybeSingle()
  const { data: qMem } = await admin.from('couple_members').select('couple_id').eq('profile_id', qid).maybeSingle()
  ok('…closed archive deleted, joiner moved', !pqGone && qMem?.couple_id === rCouple.id)
}

async function apiRoutes() {
  const ping = await fetch(APP).catch(() => null)
  if (!ping) { failures.push(`dev server not reachable at ${APP}`); return }

  for (const [method, path] of [['POST', '/api/couple/leave'], ['POST', '/api/couple/join'], ['POST', '/api/account/delete'], ['GET', '/api/account/export']]) {
    const r = await api(method, path)
    ok(`${method} ${path} unauthenticated → 401`, r.status === 401, `status ${r.status}`)
  }

  // ---- Export + leave via the API
  const p = mk(), q = mk()
  const pid = await signUp(p, 'ep'), qid = await signUp(q, 'eq')
  const couple = await newCouple(p)
  await q.rpc('join_couple', { p_code: couple.invite_code })
  const cid = couple.id
  const photo = await uploadMomentPhoto(p, cid, pid)
  const past = new Date(Date.now() - 60_000).toISOString()
  const SENT = `isi-surat-terkirim-${Date.now()}`, OPENED = `isi-surat-dibuka-${Date.now()}`, SEALED = `isi-surat-tersegel-${Date.now()}`
  const { error: l1E } = await p.from('letters').insert({ couple_id: cid, sender_id: pid, receiver_id: qid, content: SENT, unlock_date: past })
  const { data: l2, error: l2E } = await q.from('letters').insert({ couple_id: cid, sender_id: qid, receiver_id: pid, content: OPENED, unlock_date: past }).select('id').single()
  const { error: l3E } = await q.from('letters').insert({ couple_id: cid, sender_id: qid, receiver_id: pid, content: SEALED, unlock_date: past })
  ok('setup letters', !l1E && !l2E && !l3E, l1E?.message ?? l2E?.message ?? l3E?.message)
  await p.rpc('read_letter', { p_letter_id: l2.id })
  await p.from('daily_responses').insert({ couple_id: cid, profile_id: pid, question_index: 0, answer: 'jawabanku', answered_date: '2026-10-27' })
  await q.from('daily_responses').insert({ couple_id: cid, profile_id: qid, question_index: 0, answer: 'jawaban-pasangan-rahasia', answered_date: '2026-10-27' })
  // R11: Toples notes — one I sent, one to me I opened, one to me still sealed.
  const G_SENT = `toples-terkirim-${Date.now()}`, G_OPENED = `toples-dibuka-${Date.now()}`, G_SEALED = `toples-tersegel-${Date.now()}`
  const { error: g1E } = await p.from('gratitude_notes').insert({ couple_id: cid, from_id: pid, to_id: qid, body: G_SENT })
  const { data: noteOpened, error: g2E } = await q.from('gratitude_notes').insert({ couple_id: cid, from_id: qid, to_id: pid, body: G_OPENED }).select('id').single()
  const { data: noteSealed, error: g3E } = await q.from('gratitude_notes').insert({ couple_id: cid, from_id: qid, to_id: pid, body: G_SEALED }).select('id').single()
  const { error: openE } = await p.from('gratitude_notes').update({ opened_at: new Date().toISOString() }).eq('id', noteOpened?.id)
  ok('setup toples notes', !g1E && !g2E && !g3E && !openE, g1E?.message ?? g2E?.message ?? g3E?.message ?? openE?.message)

  const pCookie = await cookieFor(p)

  // R6: a non-admin must say which kind of notification it is.
  const pushBase = { recipientId: qid, title: 'Nanti Kita', body: 'Halo', url: '/app/home' }
  const noKind = await api('POST', '/api/push/send', pCookie, pushBase)
  ok('push/send without kind (non-admin) → 400', noKind.status === 400 && /notification type is required/i.test(noKind.json?.error ?? ''), `status ${noKind.status} ${noKind.text.slice(0, 120)}`)
  const badKind = await api('POST', '/api/push/send', pCookie, { ...pushBase, kind: 'semua' })
  ok('push/send with an unknown kind → 400', badKind.status === 400, `status ${badKind.status}`)
  const adminKind = await api('POST', '/api/push/send', pCookie, { ...pushBase, kind: 'admin' })
  ok("push/send kind 'admin' from a non-admin → 403", adminKind.status === 403, `status ${adminKind.status}`)
  const withKind = await api('POST', '/api/push/send', pCookie, { ...pushBase, kind: 'kangen' })
  ok('push/send with a valid kind to my partner is accepted', withKind.status === 200 || withKind.status === 503, `status ${withKind.status} ${withKind.text.slice(0, 120)}`)
  const pushUnauth = await api('POST', '/api/push/send', null, { ...pushBase, kind: 'kangen' })
  ok('push/send unauthenticated → 401', pushUnauth.status === 401, `status ${pushUnauth.status}`)
  for (const page of ['/app/profile', '/app/profile/notifikasi']) {
    const res = await api('GET', page, pCookie)
    ok(`page ${page} renders for a paired user`, res.status === 200, `status ${res.status} ${res.headers.get('location') ?? ''}`)
  }
  const exp = await api('GET', '/api/account/export', pCookie)
  ok('export → 200 JSON', exp.status === 200 && !!exp.json, `status ${exp.status} ${exp.text.slice(0, 120)}`)
  ok('export is a dated download', /attachment; filename="nanti-kita-\d{4}-\d{2}-\d{2}\.json"/.test(exp.headers.get('content-disposition') ?? ''), exp.headers.get('content-disposition'))
  const j = exp.json ?? {}
  ok('export: profile + couple members', j.profile?.id === pid && j.couple?.members?.length === 2)
  ok('export: moment with photo storage path', j.moments?.[0]?.photos?.[0]?.storage_path === photo.path)
  ok('export: sent letter text included', exp.text.includes(SENT))
  ok('export: opened received letter text included', exp.text.includes(OPENED))
  ok('export: unopened letter text NOT included', !exp.text.includes(SEALED))
  ok('export: all 3 letters listed (metadata)', j.letters?.length === 3)
  ok('export: own daily answer in, partner answer out', exp.text.includes('jawabanku') && !exp.text.includes('jawaban-pasangan-rahasia'))
  ok('export: savings + calendar sections present', Array.isArray(j.savings?.transactions) && Array.isArray(j.calendar_events))
  ok('export: toples note I sent keeps its text', exp.text.includes(G_SENT))
  ok('export: opened toples note to me keeps its text', exp.text.includes(G_OPENED))
  ok('export: unopened toples note to me has NO text', !exp.text.includes(G_SEALED))
  const sealedNote = (j.gratitude_notes ?? []).find((n) => n.id === noteSealed?.id)
  ok('export: unopened note still listed (id, body null, hidden note)', j.gratitude_notes?.length === 3 && sealedNote?.body === null && typeof sealedNote?.body_hidden === 'string', JSON.stringify(sealedNote))
  ok('export: couple carries closed_at', j.couple && 'closed_at' in j.couple && j.couple.closed_at === null)

  const leave1 = await api('POST', '/api/couple/leave', pCookie)
  ok('API leave with partner → 200, not deleted', leave1.status === 200 && leave1.json?.deleted === false, `status ${leave1.status} ${leave1.text.slice(0, 120)}`)
  ok('photos kept while partner remains', (await listFolder('moments', `${cid}/${photo.momentId}`)).length === 1)
  const leaveAgain = await api('POST', '/api/couple/leave', pCookie)
  ok('API leave without couple → 400', leaveAgain.status === 400, `status ${leaveAgain.status}`)
  const bounced = await api('GET', '/app/profile', pCookie)
  ok('after leaving, /app sends you to the couple step', /\/onboarding\/couple/.test(bounced.headers.get('location') ?? ''), bounced.headers.get('location'))
  const step = await api('GET', '/onboarding/couple?left=1', pCookie)
  ok('couple step renders after leaving', step.status === 200, `status ${step.status}`)
  const qCookie = await cookieFor(q)
  const qProfile = await api('GET', '/app/profile', qCookie)
  ok('remaining partner (closed couple) still opens /app/profile', qProfile.status === 200, `status ${qProfile.status} ${qProfile.headers.get('location') ?? ''}`)
  const qExp = await api('GET', '/api/account/export', qCookie)
  ok('remaining partner can export the archive (closed_at set)', qExp.status === 200 && !!qExp.json?.couple?.closed_at && qExp.json?.moments?.length === 1, `status ${qExp.status}`)
  const leave2 = await api('POST', '/api/couple/leave', qCookie)
  ok('API last member leave → deleted', leave2.status === 200 && leave2.json?.deleted === true, `status ${leave2.status} ${leave2.text.slice(0, 120)}`)
  ok('API leave removed the couple photos from storage', (await listFolder('moments', `${cid}/${photo.momentId}`)).length === 0 && (await listFolder('moments', cid)).length === 0)
  const { data: gone } = await admin.from('couples').select('id').eq('id', cid).maybeSingle()
  ok('API leave deleted the couple', !gone)

  // ---- Account deletion via the API: the phrase the app sends now, and the
  // legacy phrase that app versions before the English switch still send.
  await accountDeletion({ phrase: 'DELETE ACCOUNT', wrongPhrase: 'delete account', tags: ['er', 'es'] })
  await accountDeletion({ phrase: 'HAPUS AKUN', wrongPhrase: 'hapus', tags: ['dr', 'ds'] })
}

async function accountDeletion({ phrase, wrongPhrase, tags }) {
  const t = ` [${phrase}]`
  const r = mk(), s = mk()
  const rid = await signUp(r, tags[0]), sid = await signUp(s, tags[1])
  const c2 = await newCouple(r)
  await s.rpc('join_couple', { p_code: c2.invite_code })
  const avatarPath = `${rid}/avatar.jpg`
  const { error: avE } = await r.storage.from('avatars').upload(avatarPath, jpeg, { contentType: 'image/jpeg', upsert: true })
  uploaded.push(['avatars', avatarPath])
  ok('setup avatar' + t, !avE, avE?.message)
  const { data: g2 } = await r.from('savings_goals').insert({ couple_id: c2.id, name: 'Nikah', target_amount: 9000000 }).select().single()
  const { data: tx2 } = await r.from('couple_transactions').insert({ couple_id: c2.id, goal_id: g2.id, amount: 120000, type: 'deposit', created_by: rid }).select().single()

  const rCookie = await cookieFor(r)
  const wrong = await api('POST', '/api/account/delete', rCookie, { confirm: wrongPhrase })
  ok('delete without exact confirmation → 400' + t, wrong.status === 400, `status ${wrong.status}`)
  const { data: stillThere } = await admin.auth.admin.getUserById(rid)
  ok('…and the account is untouched' + t, stillThere?.user?.id === rid)

  const del = await api('POST', '/api/account/delete', rCookie, { confirm: phrase })
  ok('delete account → 200' + t, del.status === 200 && del.json?.ok === true, `status ${del.status} ${del.text.slice(0, 120)}`)
  const { data: afterDel } = await admin.auth.admin.getUserById(rid)
  ok('auth user gone' + t, !afterDel?.user)
  const { data: prof } = await admin.from('profiles').select('id').eq('id', rid).maybeSingle()
  ok('profile gone' + t, !prof)
  ok('avatar files removed' + t, (await listFolder('avatars', rid)).length === 0)
  const { data: c2Members } = await admin.from('couple_members').select('profile_id').eq('couple_id', c2.id)
  ok('partner keeps the couple' + t, c2Members?.length === 1 && c2Members[0].profile_id === sid)
  const { data: tx2Kept } = await s.from('couple_transactions').select('id, created_by').eq('id', tx2.id).maybeSingle()
  ok('partner keeps the deleted user\'s transaction' + t, tx2Kept?.id === tx2.id && tx2Kept.created_by === null)
  const { data: leftAct } = await s.from('activities').select('kind').eq('couple_id', c2.id).eq('kind', 'left')
  ok("partner sees the 'left' activity" + t, leftAct?.length === 1)

  // Last member deleting their account takes the couple and its photos along.
  const photo2 = await uploadMomentPhoto(s, c2.id, sid)
  const sCookie = await cookieFor(s)
  const del2 = await api('POST', '/api/account/delete', sCookie, { confirm: phrase })
  ok('last member deletes account → 200' + t, del2.status === 200, `status ${del2.status} ${del2.text.slice(0, 120)}`)
  const { data: c2Gone } = await admin.from('couples').select('id').eq('id', c2.id).maybeSingle()
  ok('their couple is deleted' + t, !c2Gone)
  ok('their couple photos are removed' + t, (await listFolder('moments', `${c2.id}/${photo2.momentId}`)).length === 0)
  const { data: sGone } = await admin.auth.admin.getUserById(sid)
  ok('last member auth user gone' + t, !sGone?.user)
}

async function main() {
  quietHourCases()
  const pair = await inviteCodes()
  await leaveWithPartner(pair)
  await creatorDeletion()
  await notificationPrefs()
  await joinWithData()
  await apiRoutes()
}

try { await main() } catch (e) { failures.push(`crash: ${e.message}`) }
finally {
  for (const [bucket, path] of uploaded) await admin.storage.from(bucket).remove([path])
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined)
  // Couples whose members were all deleted stay behind (created_by is set null).
  if (couples.size) await admin.from('couples').delete().in('id', [...couples])
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('ACCOUNT VERIFY PASSED')
