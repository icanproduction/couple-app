// End-to-end data-layer check against a LOCAL Supabase (supabase start).
// Exercises signup, couple create/join, RLS isolation and every write path the
// app uses, then deletes the users it created.
//
//   node scripts/verify/rls-flows.mjs
//
// Prints "RLS FLOWS PASSED" only when every check passes; exits 1 otherwise.
// Refuses to run unless NEXT_PUBLIC_SUPABASE_URL points at localhost, because
// it creates and deletes auth users.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const env = {}
  // Later files win, mirroring Next.js precedence for `next dev`.
  for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL)) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${URL})`)
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL, ANON, opts)
const admin = createClient(URL, SERVICE, opts)

const DEMO_COUPLE = '33333333-3333-4333-8333-333333333333'
// "Cerita Awal Kita" — a free pack from 20261027130000_deep_talk_packs.sql
const PACK_1 = '66666666-0000-4000-8000-000000000001'
let pass = 0
const failures = []
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else failures.push(`${name}${extra ? ' — ' + extra : ''}`)
}
const created = []
const extraCouples = []

/** A valid Samakan v2 bank set: 7 rounds in the fixed kind order. */
function samakanRounds(tag) {
  const round = (kind, i) => ({
    kind, prompt: `${tag} round ${i + 1}: which one tonight?`, source: 'general', talk: '', bank_id: `${tag}-${i}`,
    options: kind === 'match' ? ['Stay in', 'Go out'] : kind === 'guess' ? ['Nasi goreng', 'Sate ayam', 'Bakso', 'Gado-gado'] : [],
    ...(kind === 'scale' ? { low: 'Not at all', high: 'Very much' } : {}),
  })
  return ['match', 'guess', 'scale', 'guess', 'match', 'scale', 'guess'].map(round)
}

async function signUp(client, tag) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@verify.local`
  const { data, error } = await client.auth.signUp({ email, password: 'verify-pass-123' })
  if (data?.user) created.push(data.user.id)
  return { data, error }
}

async function main() {
  // --- Seeded demo couple -------------------------------------------------
  const raka = mk()
  const { data: s1, error: e1 } = await raka.auth.signInWithPassword({ email: 'raka@couple.local', password: 'couple123' })
  ok('demo login', !e1 && s1?.user, e1?.message)
  if (!s1?.user) throw new Error('seed missing — run `supabase db reset`')
  const rid = s1.user.id
  const { data: mem, error: memE } = await raka.from('couple_members').select('couple_id').eq('profile_id', rid).single()
  ok('demo membership', mem?.couple_id === DEMO_COUPLE, memE?.message)
  const { data: partners } = await raka.from('couple_members').select('profile_id').eq('couple_id', DEMO_COUPLE).neq('profile_id', rid)
  ok('sees partner membership', partners?.length === 1)
  const { data: pprof } = await raka.from('profiles').select('name').eq('id', partners?.[0]?.profile_id).single()
  ok('reads partner profile', pprof?.name === 'Nadia')
  const { count: pc } = await raka.from('profiles').select('*', { count: 'exact', head: true })
  ok('admin counts all profiles', (pc ?? 0) >= 2, `count=${pc}`)
  const { data: packs } = await raka.from('deep_talk_packs').select('slug, is_free').eq('is_published', true)
  ok('10 free published packs', (packs ?? []).filter((p) => p.is_free).length === 10, `packs=${packs?.length}`)
  const { data: lv } = await raka.from('deep_talk_levels').select('id,level_number,question_count').eq('pack_id', PACK_1).order('level_number')
  const { count: activeQ } = await raka.from('deep_talk_questions').select('*', { count: 'exact', head: true }).eq('level_id', lv?.[0]?.id).eq('is_active', true)
  ok('question_count matches active questions', lv?.[0]?.question_count === activeQ, `${lv?.[0]?.question_count} vs ${activeQ}`)

  // --- Fresh signup → create couple → partner joins ----------------------
  const a = mk(), b = mk(), c = mk()
  const { data: sa, error: ea } = await signUp(a, 'a')
  ok('signup without email confirmation', !ea && sa?.session, ea?.message)
  const aid = sa.user.id
  const { data: aprof } = await a.from('profiles').select('id,onboarding_complete,role').eq('id', aid).single()
  ok('profile auto-created', aprof?.id === aid && aprof.onboarding_complete === false)
  const { error: upE } = await a.from('profiles').update({ name: 'Andi', birthday: '1999-01-01', relationship_start_date: '2024-05-05' }).eq('id', aid)
  ok('profile update', !upE, upE?.message)
  await a.from('profiles').update({ role: 'admin' }).eq('id', aid)
  const { data: roleNow } = await a.from('profiles').select('role').eq('id', aid).single()
  ok('cannot self-promote to admin', roleNow?.role !== 'admin', `role=${roleNow?.role}`)

  const { data: couple, error: cE } = await a.rpc('create_couple')
  ok('create_couple RPC', !cE && couple?.id && /^[A-Z2-9]{8}$/.test(couple.invite_code), cE?.message)
  const { data: again } = await a.rpc('create_couple')
  ok('create_couple is idempotent (no second couple)', again?.id === couple.id)
  const { data: myMem } = await a.from('couple_members').select('couple_id').eq('profile_id', aid)
  ok('creator is the only membership', myMem?.length === 1 && myMem[0].couple_id === couple.id)
  const code = couple.invite_code
  const { error: premE } = await a.from('couples').update({ is_premium: true }).eq('id', couple.id).select()
  const { data: premNow } = await a.from('couples').select('is_premium').eq('id', couple.id).single()
  ok('member cannot self-unlock premium', premNow?.is_premium === false, premE?.message)

  const { data: sb } = await signUp(b, 'b')
  const bid = sb.user.id
  const { data: listAll } = await b.from('couples').select('id')
  ok('non-member cannot list couples', (listAll ?? []).length === 0, `saw ${listAll?.length}`)
  const { error: directJoin } = await b.from('couple_members').insert({ couple_id: couple.id, profile_id: bid })
  ok('direct membership insert blocked (code required)', !!directJoin)
  const { error: badCode } = await b.rpc('join_couple', { p_code: 'ZZZZZZZZ' })
  ok('join with wrong code rejected', !!badCode)
  // B first makes a solo couple, then joins A: the solo couple must go away.
  const { data: bSolo } = await b.rpc('create_couple')
  const { data: joined, error: jE } = await b.rpc('join_couple', { p_code: code.toLowerCase() })
  ok('partner joins via code (case-insensitive)', !jE && joined === couple.id, jE?.message)
  const { data: bMem } = await b.from('couple_members').select('couple_id').eq('profile_id', bid)
  ok('joiner left their solo couple', bMem?.length === 1 && bMem[0].couple_id === couple.id && bSolo?.id !== couple.id)

  const { data: sc } = await signUp(c, 'c')
  const { error: fullE } = await c.rpc('join_couple', { p_code: code })
  ok('third member rejected', /already full/.test(fullE?.message ?? ''), fullE?.message)
  const { data: leak } = await c.from('couple_members').select('id').eq('couple_id', couple.id)
  ok('outsider cannot list members', (leak ?? []).length === 0)
  const { data: leakP } = await c.from('profiles').select('id').eq('id', aid)
  ok('outsider cannot read profile', (leakP ?? []).length === 0)
  const { data: leakC } = await c.from('couples').select('id').eq('invite_code', code)
  ok('outsider cannot look up invite code', (leakC ?? []).length === 0)

  // --- Every write path the app uses (as partner B) ----------------------
  const cid = couple.id
  const today = '2026-10-26'
  const r = {}
  r.daily = await b.from('daily_responses').upsert({ couple_id: cid, profile_id: bid, question_index: 1, answer: 'x', answered_date: today }, { onConflict: 'couple_id,profile_id,answered_date' })
  r.daily2 = await b.from('daily_responses').upsert({ couple_id: cid, profile_id: bid, question_index: 1, answer: 'y', answered_date: today }, { onConflict: 'couple_id,profile_id,answered_date' })
  r.goal = await b.from('savings_goals').insert({ couple_id: cid, name: 'Nikah', target_amount: 50000000 }).select().single()
  r.entry = await b.from('savings_entries').upsert({ goal_id: r.goal.data?.id, couple_id: cid, month: '2026-10', amount: 100000 }, { onConflict: 'goal_id,month' })
  r.tx = await b.from('couple_transactions').insert({ couple_id: cid, goal_id: r.goal.data?.id, amount: 250000, type: 'deposit', created_by: bid })
  r.spend = await b.from('spending_results').upsert({ couple_id: cid, profile_id: bid, spending_type: 'saver', scores: {}, answers: {} }, { onConflict: 'couple_id,profile_id' })
  const endpoint = `https://push.invalid/${Date.now()}`
  r.push = await b.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: 'k', p_auth_key: 'a' })
  r.pet = await b.from('couple_pets').insert({ couple_id: cid, pet_type: 'cat', name: 'Mochi' }).select().single()
  // The old care RPC stays callable for old clients and counts as B's hi.
  r.care = await b.rpc('perform_pet_care', { p_pet_id: r.pet.data?.id, p_action: 'feed' })
  r.letter = await b.from('letters').insert({ couple_id: cid, sender_id: bid, receiver_id: aid, content: 'hai', unlock_date: new Date(Date.now() + 864e5).toISOString() })
  r.miss = await b.from('miss_you').insert({ couple_id: cid, sender_id: bid, receiver_id: aid })
  r.event = await b.from('couple_events').insert({ couple_id: cid, title: 'Date', event_date: today, event_type: 'date', event_scope: 'couple', created_by: bid })
  r.wish = await b.from('wishlist_items').insert({ couple_id: cid, name: 'Kamera', price: 5000000, owner_type: 'me', owner_id: bid })
  r.wed = await b.from('wedding_budget_items').insert({ couple_id: cid, category: 'venue', name: 'Gedung' })
  r.mbti = await b.from('mbti_results').insert({ profile_id: bid, couple_id: cid, mbti_type: 'INFJ', answers: {}, scores: {} })
  r.assess = await b.from('assessment_results').insert({ profile_id: bid, couple_id: cid, answers: {}, scores: {} })
  r.dtp = await b.from('deep_talk_progress').upsert({ couple_id: cid, pack_id: PACK_1, level_number: 1, current_question_index: 2 }, { onConflict: 'couple_id,pack_id' })
  r.tx2 = await b.from('couple_transactions').insert({ couple_id: cid, goal_id: r.goal.data?.id, amount: -50000, type: 'withdrawal', created_by: bid })
  for (const [k, v] of Object.entries(r)) ok(`write ${k}`, !v.error, v.error?.message)
  // v0.8: a new pet starts with server-owned defaults (no mood state any more).
  ok('new pet defaults: level 1, no XP, not home yet', r.pet.data?.level === 1 && r.pet.data?.xp === 0 && r.pet.data?.hatched_at === null, JSON.stringify(r.pet.data))
  // v0.8: the old pet tables and game_sessions are read-only history for clients.
  const moodW = await b.from('pet_mood_state').insert({ pet_id: r.pet.data?.id, updated_at: new Date().toISOString() }).select().single()
  ok('client can no longer write pet mood state', !!moodW.error && !moodW.data, moodW.error?.message ?? 'insert went through')
  const rolesW = await b.from('pet_care_roles').insert({ couple_id: cid, pet_id: r.pet.data?.id, profile_id: bid, actions: ['feed'] }).select()
  ok('client can no longer write care roles', !!rolesW.error && !rolesW.data, rolesW.error?.message ?? 'insert went through')
  const gameW = await b.from('game_sessions').insert({ couple_id: cid, created_by: bid, partner_id: aid, chapter_id: 'hari-pertama', round_types: ['a'], rounds: [] }).select('id,status').single()
  ok('authenticated insert into game_sessions is refused', !!gameW.error && !gameW.data, gameW.error?.message ?? 'insert went through')
  // A v1 game (written by the service role, as history) stays readable by the
  // couple only, and no member can change or delete it.
  const { data: v1, error: v1E } = await admin.from('game_sessions').insert({ couple_id: cid, created_by: bid, partner_id: aid, chapter_id: 'hari-pertama', status: 'completed', round_types: ['pilih_sama'], rounds: [], total_score: 12, completed_at: new Date().toISOString() }).select('id').single()
  const { data: v1Read } = await b.from('game_sessions').select('id, status').eq('id', v1?.id)
  const { data: v1Outsider } = await c.from('game_sessions').select('id').eq('id', v1?.id)
  ok('v1 game readable by the couple, not by outsiders', !v1E && v1Read?.length === 1 && v1Read[0].status === 'completed' && (v1Outsider ?? []).length === 0, v1E?.message)
  const { data: v1Upd } = await a.from('game_sessions').update({ total_score: 99 }).eq('id', v1?.id).select('id')
  const { data: v1Del } = await b.from('game_sessions').delete().eq('id', v1?.id).select('id')
  const { data: v1Now } = await admin.from('game_sessions').select('total_score').eq('id', v1?.id).maybeSingle()
  ok('v1 game cannot be edited or deleted by members', (v1Upd ?? []).length === 0 && (v1Del ?? []).length === 0 && v1Now?.total_score === 12, JSON.stringify(v1Now))

  // --- Hardening: integrity rules -----------------------------------------
  const { data: goalNow } = await b.from('savings_goals').select('current_amount').eq('id', r.goal.data?.id).single()
  ok('goal balance maintained by trigger', Number(goalNow?.current_amount) === 200000, `got ${goalNow?.current_amount}`)
  const { error: aiqE } = await b.from('ai_daily_questions').insert({ couple_id: cid, question: 'Apa?', generated_by: bid, question_date: today })
  ok('users cannot write AI questions directly', !!aiqE)
  const { error: pet2E } = await a.from('couple_pets').insert({ couple_id: cid, pet_type: 'dog', name: 'Dua' })
  ok('second pet per couple rejected', !!pet2E)
  // Samakan v2: one open set per couple, whoever starts it; clients never write sets.
  const set1 = await admin.rpc('samakan_insert_set', { p_couple: cid, p_creator: aid, p_source: 'bank', p_theme: 'food', p_reason: null, p_rounds: samakanRounds('rls-1') })
  const set2 = await admin.rpc('samakan_insert_set', { p_couple: cid, p_creator: bid, p_source: 'bank', p_theme: 'home', p_reason: null, p_rounds: samakanRounds('rls-2') })
  const { error: rawOpenE } = await admin.from('samakan_sets').insert({ couple_id: cid, created_by: bid, source: 'bank', theme: 'travel' })
  const { count: openSets } = await admin.from('samakan_sets').select('*', { count: 'exact', head: true }).eq('couple_id', cid).eq('status', 'open')
  ok('second open Samakan set per couple rejected', !set1.error && set1.data?.existing === false && set2.data?.existing === true && set2.data?.id === set1.data?.id
    && /samakan_sets_one_open|duplicate key/.test(rawOpenE?.message ?? '') && openSets === 1, `${JSON.stringify(set1.data ?? set1.error)} / ${JSON.stringify(set2.data ?? set2.error)} / ${rawOpenE?.message} / open=${openSets}`)
  const { error: clientSetE } = await a.from('samakan_sets').insert({ couple_id: cid, created_by: aid, source: 'bank', theme: 'travel' })
  ok('members cannot create Samakan sets directly', !!clientSetE)
  const { error: fakeMiss } = await b.from('miss_you').insert({ couple_id: cid, sender_id: aid, receiver_id: bid })
  ok('cannot send kangen as partner', !!fakeMiss)
  const { error: fakeTx } = await b.from('couple_transactions').insert({ couple_id: cid, amount: 1, type: 'deposit', created_by: aid })
  ok('cannot record transaction as partner', !!fakeTx)
  const { error: fakeAns } = await b.from('daily_responses').insert({ couple_id: cid, profile_id: aid, question_index: 1, answer: 'z', answered_date: today })
  ok('cannot answer as partner', !!fakeAns)

  // Pet rules enforced on the server (v0.8: no decay, roles or cooldowns; one
  // hi per person per Jakarta day; XP only from the warmth ledger).
  const petId = r.pet.data?.id
  ok('old care RPC still answers old clients', r.care.data?.hunger === 100 && r.care.data?.mood === 'thriving', JSON.stringify(r.care.data))
  const xpOf = async () => (await admin.from('couple_pets').select('xp, level, hatched_at').eq('id', petId).single()).data
  const xpBeforeAgain = await xpOf()
  const { data: againHi, error: againE } = await b.rpc('pet_say_hi', { p_gesture: 'play' })
  const { error: againCareE } = await b.rpc('perform_pet_care', { p_pet_id: petId, p_action: 'play' })
  const xpAfterAgain = await xpOf()
  ok('say hi counts once a day', !againE && againHi?.counted === false && againHi?.points === 0 && !againCareE && xpAfterAgain?.xp === xpBeforeAgain?.xp,
    `${againE?.message ?? JSON.stringify(againHi)} ${againCareE?.message ?? ''} xp ${xpBeforeAgain?.xp} → ${xpAfterAgain?.xp}`)
  const { data: bHis } = await admin.from('pet_warmth_events').select('points, gesture').eq('pet_id', petId).eq('source', 'hi').eq('actor_id', bid)
  ok('the old care RPC counted as one hi (+5, snack)', bHis?.length === 1 && bHis[0].points === 5 && bHis[0].gesture === 'snack', JSON.stringify(bHis))
  const { data: aHi, error: aHiE } = await a.rpc('pet_say_hi', { p_gesture: 'pat' })
  ok('partner\'s first hi adds the both-of-you bonus and brings the pet home', !aHiE && aHi?.counted === true && aHi?.points === 10 && aHi?.both_today === true
    && aHi?.hatched === true && aHi?.just_hatched === true, aHiE?.message ?? JSON.stringify(aHi))
  // Care roles and the pet itself: no client can rewrite roles or remove the
  // pet. Legacy rows (as v0.7 left them) are seeded by the service role.
  const { error: legacyRoleE } = await admin.from('pet_care_roles').insert({ couple_id: cid, pet_id: petId, profile_id: bid, actions: ['feed'] })
  const { error: legacyMoodE } = await admin.from('pet_mood_state').insert({ pet_id: petId, updated_at: new Date().toISOString() })
  ok('setup: legacy care role + mood rows (service role)', !legacyRoleE && !legacyMoodE, legacyRoleE?.message ?? legacyMoodE?.message)
  const { data: roleHack, error: roleHackE } = await b.from('pet_care_roles').update({ actions: ['feed', 'play', 'walk'] }).eq('pet_id', petId).select('id')
  const { data: roleDel } = await a.from('pet_care_roles').delete().eq('pet_id', petId).select('id')
  const { data: roleNowRows } = await admin.from('pet_care_roles').select('actions').eq('pet_id', petId)
  ok('client can no longer change or remove care roles', (!!roleHackE || (roleHack ?? []).length === 0) && (roleDel ?? []).length === 0
    && roleNowRows?.length === 1 && roleNowRows[0].actions.join() === 'feed', JSON.stringify(roleNowRows))
  const { data: petDel, error: petDelE } = await b.from('couple_pets').delete().eq('id', petId).select('id')
  const { data: petDelA } = await a.from('couple_pets').delete().eq('couple_id', cid).select('id')
  const { data: petStill } = await admin.from('couple_pets').select('id').eq('id', petId).maybeSingle()
  ok('client can no longer delete the pet', (!!petDelE || (petDel ?? []).length === 0) && (petDelA ?? []).length === 0 && petStill?.id === petId)
  const { data: moodHack } = await b.from('pet_mood_state').update({ hunger: 100, happiness: 100 }).eq('pet_id', petId).select('id')
  const { error: logHack } = await b.from('pet_care_logs').insert({ pet_id: petId, action_type: 'play', done_by: bid })
  const { data: xpHack } = await b.from('couple_pets').update({ xp: 9999 }).eq('id', petId).select('id')
  const { data: moodNow } = await admin.from('pet_mood_state').select('hunger').eq('pet_id', petId).single()
  ok('pet stats/logs/xp not writable directly', (moodHack ?? []).length === 0 && !!logHack && (xpHack ?? []).length === 0 && moodNow?.hunger !== 100, JSON.stringify(moodNow))
  const { error: warmHack } = await b.from('pet_warmth_events').insert({ pet_id: petId, couple_id: cid, actor_id: bid, source: 'hi', points: 50 })
  const { data: lvlHack } = await b.from('couple_pets').update({ level: 20 }).eq('id', petId).select('id')
  const { data: hatchHack } = await b.from('couple_pets').update({ hatched_at: null }).eq('id', petId).select('id')
  const { error: awardHack } = await b.rpc('pet_award', { p_couple: cid, p_actor: bid, p_source: 'moment' })
  ok('warmth ledger, level and hatched_at not writable directly', !!warmHack && (lvlHack ?? []).length === 0 && (hatchHack ?? []).length === 0 && !!awardHack)
  const { data: renamed, error: renameE } = await b.from('couple_pets').update({ name: 'Mochi Dua' }).eq('id', petId).select('name')
  ok('members can still rename the pet', !renameE && renamed?.[0]?.name === 'Mochi Dua', renameE?.message)
  const { count: careLogs } = await admin.from('pet_care_logs').select('*', { count: 'exact', head: true }).eq('pet_id', petId)
  ok('the old care RPC writes no pet_care_logs', careLogs === 0, `logs=${careLogs}`)
  const petNow = await xpOf()
  const { data: ledger } = await admin.from('pet_warmth_events').select('points').eq('pet_id', petId)
  const ledgerSum = (ledger ?? []).reduce((s, e) => s + e.points, 0)
  ok('pet xp equals its warmth ledger (one hi each + the bonus included)', petNow?.xp === ledgerSum && petNow?.level === 1 && petNow?.hatched_at !== null && ledgerSum >= 15,
    `${JSON.stringify(petNow)} ledger=${ledgerSum}`)
  const { error: kangen2 } = await b.from('miss_you').insert({ couple_id: cid, sender_id: bid, receiver_id: aid })
  ok('kangen cooldown enforced', /Wait a bit/.test(kangen2?.message ?? ''), kangen2?.message)
  const { error: overdraw } = await b.from('couple_transactions').insert({ couple_id: cid, goal_id: r.goal.data?.id, amount: -999999999, type: 'withdrawal', created_by: bid })
  ok('withdrawal beyond balance rejected', /too low/.test(overdraw?.message ?? ''), overdraw?.message)

  // R2: a transaction / savings entry can only point at a goal of its own couple.
  const { data: cCouple, error: ccE } = await c.rpc('create_couple')
  if (cCouple?.id) extraCouples.push(cCouple.id)
  const { data: cGoal, error: cgE } = await c.from('savings_goals').insert({ couple_id: cCouple?.id, name: 'Motor', target_amount: 1000000 }).select().single()
  ok('setup: other couple with its own goal', !ccE && !cgE && cGoal?.id, ccE?.message ?? cgE?.message)
  // A pet's XP, level and "home" state come from the server, never from the adopter.
  const { error: richPetE } = await c.from('couple_pets').insert({ couple_id: cCouple?.id, pet_type: 'dog', name: 'Kaya', xp: 9999, level: 50, hatched_at: new Date().toISOString() })
  const { count: cPets } = await admin.from('couple_pets').select('*', { count: 'exact', head: true }).eq('couple_id', cCouple?.id)
  ok('client cannot adopt a pet with XP, level or hatched_at set', /permission denied/.test(richPetE?.message ?? '') && cPets === 0, richPetE?.message)
  const { error: crossTx } = await b.from('couple_transactions').insert({ couple_id: cid, goal_id: cGoal?.id, amount: 1000, type: 'deposit', created_by: bid })
  ok("transaction into another couple's goal rejected", !!crossTx)
  const { error: crossTx2 } = await c.from('couple_transactions').insert({ couple_id: cCouple?.id, goal_id: r.goal.data?.id, amount: 1000, type: 'deposit', created_by: sc.user.id })
  ok("transaction from my couple onto a foreign goal id rejected", !!crossTx2)
  const { error: crossEntry } = await b.from('savings_entries').insert({ goal_id: cGoal?.id, couple_id: cid, month: '2026-11', amount: 1000 })
  ok("savings entry for another couple's goal rejected", !!crossEntry)
  const { error: crossEntry2 } = await c.from('savings_entries').insert({ goal_id: r.goal.data?.id, couple_id: cCouple?.id, month: '2026-11', amount: 1000 })
  ok('savings entry onto a foreign goal id rejected', !!crossEntry2)
  const { data: cGoalNow } = await admin.from('savings_goals').select('current_amount').eq('id', cGoal?.id).single()
  const { data: goalAfterCross } = await admin.from('savings_goals').select('current_amount').eq('id', r.goal.data?.id).single()
  ok('both balances untouched by cross-couple attempts', Number(cGoalNow?.current_amount) === 0 && Number(goalAfterCross?.current_amount) === 200000,
    `${cGoalNow?.current_amount} / ${goalAfterCross?.current_amount}`)

  // R1: spending results — the partner may read, only the owner may write.
  const { data: aSeesSpend } = await a.from('spending_results').select('id, spending_type').eq('profile_id', bid)
  ok("partner reads my spending result", aSeesSpend?.length === 1 && aSeesSpend[0].spending_type === 'saver')
  const { data: aEditsSpend } = await a.from('spending_results').update({ spending_type: 'spender' }).eq('profile_id', bid).select('id')
  ok("partner cannot edit my spending result", (aEditsSpend ?? []).length === 0)
  const { data: aDelSpend } = await a.from('spending_results').delete().eq('profile_id', bid).select('id')
  ok("partner cannot delete my spending result", (aDelSpend ?? []).length === 0)
  const { error: aForgeSpend } = await a.from('spending_results').insert({ couple_id: cid, profile_id: bid, spending_type: 'spender', scores: {}, answers: {} })
  ok("partner cannot write a spending result for me", !!aForgeSpend)
  const { data: bSpendNow } = await admin.from('spending_results').select('spending_type').eq('profile_id', bid).single()
  ok('my spending result unchanged', bSpendNow?.spending_type === 'saver', bSpendNow?.spending_type)
  const { error: aOwnSpend } = await a.from('spending_results').upsert({ couple_id: cid, profile_id: aid, spending_type: 'spender', scores: {}, answers: {} }, { onConflict: 'couple_id,profile_id' })
  ok('owner writes own spending result', !aOwnSpend, aOwnSpend?.message)
  const { error: cSpendForeign } = await c.from('spending_results').insert({ couple_id: cid, profile_id: sc.user.id, spending_type: 'saver', scores: {}, answers: {} })
  ok("outsider cannot file a spending result under another couple", !!cSpendForeign)
  const { data: cSeesSpend } = await c.from('spending_results').select('id').eq('couple_id', cid)
  ok("outsider cannot read a couple's spending results", (cSeesSpend ?? []).length === 0)

  // Partner's daily answer stays hidden until you answer the same day.
  const { data: peekBefore } = await a.from('daily_responses').select('id').eq('couple_id', cid).eq('profile_id', bid)
  ok('partner answer hidden before answering', (peekBefore ?? []).length === 0, `saw ${peekBefore?.length}`)
  await a.from('daily_responses').insert({ couple_id: cid, profile_id: aid, question_index: 1, answer: 'a', answered_date: today })
  const { data: peekAfter } = await a.from('daily_responses').select('id').eq('couple_id', cid).eq('profile_id', bid)
  ok('partner answer visible after answering', peekAfter?.length === 1)

  // Letters: content only through read_letter once unlocked.
  const { data: aSees } = await a.from('letters').select('id, unlock_date').eq('couple_id', cid)
  ok('partner sees letter metadata', aSees?.length === 1)
  const { error: contentE } = await a.from('letters').select('content').eq('couple_id', cid)
  ok('letter content not selectable', !!contentE)
  const { error: lockedE } = await a.rpc('read_letter', { p_letter_id: aSees?.[0]?.id })
  ok('locked letter unreadable by receiver', /still locked/.test(lockedE?.message ?? ''), lockedE?.message)
  const { data: senderRead } = await b.rpc('read_letter', { p_letter_id: aSees?.[0]?.id })
  ok('sender can read own sealed letter', senderRead?.[0]?.content === 'hai')
  const { data: redate } = await a.from('letters').update({ unlock_date: new Date().toISOString() }).eq('couple_id', cid).select('id')
  ok('letter cannot be re-dated', (redate ?? []).length === 0)
  const { data: opened } = await b.from('letters').insert({ couple_id: cid, sender_id: bid, receiver_id: aid, content: 'buka', unlock_date: new Date(Date.now() - 60000).toISOString() }).select('id').single()
  const { data: readNow } = await a.rpc('read_letter', { p_letter_id: opened?.id })
  ok('unlocked letter readable + marked opened', readNow?.[0]?.content === 'buka' && readNow?.[0]?.is_opened === true)

  // Deep Talk: a free pack opens every level (1-5 since 20261104090000) to a
  // non-premium couple…
  const { data: lvAll } = await b.from('deep_talk_levels').select('id, level_number').eq('pack_id', PACK_1)
  const { data: qFree } = await b.from('deep_talk_questions').select('id').in('level_id', (lvAll ?? []).map((l) => l.id))
  const { count: qAllAdmin } = await admin.from('deep_talk_questions').select('*', { count: 'exact', head: true }).in('level_id', (lvAll ?? []).map((l) => l.id))
  ok('free pack: all 5 levels and all 30 questions readable without premium',
    (lvAll ?? []).map((l) => l.level_number).sort().join() === '1,2,3,4,5' && (qFree ?? []).length === 30 && qAllAdmin === 30,
    `levels ${lvAll?.map((l) => l.level_number)} got ${qFree?.length} of ${qAllAdmin}`)
  // …while a premium pack still only gives level 1.
  const { data: paidPack } = await admin.from('deep_talk_packs')
    .insert({ slug: `verify-paid-${Date.now()}`, title: 'Verify Paid', is_published: true, is_free: false }).select('id').single()
  const { data: paidLv } = await admin.from('deep_talk_levels').select('id, level_number').eq('pack_id', paidPack?.id)
  const l1 = paidLv?.find((l) => l.level_number === 1)?.id
  const l2 = paidLv?.find((l) => l.level_number === 2)?.id
  const l5 = paidLv?.find((l) => l.level_number === 5)?.id
  await admin.from('deep_talk_questions').insert([{ level_id: l1, question_text: 'L1?', sort_order: 1 }, { level_id: l2, question_text: 'L2?', sort_order: 1 }, { level_id: l5, question_text: 'L5?', sort_order: 1 }])
  const { data: q2 } = await b.from('deep_talk_questions').select('id').eq('level_id', l2)
  const { data: q5 } = await b.from('deep_talk_questions').select('id').eq('level_id', l5)
  const { data: q1 } = await b.from('deep_talk_questions').select('id').eq('level_id', l1)
  ok('free couple cannot fetch level-2 questions of a premium pack', (q2 ?? []).length === 0 && (q1 ?? []).length > 0, `l1=${q1?.length} l2=${q2?.length}`)
  ok('free couple cannot fetch level-5 questions of a premium pack', !!l5 && (q5 ?? []).length === 0, `l5=${l5} got ${q5?.length}`)
  await admin.from('deep_talk_packs').delete().eq('id', paidPack?.id)
  const { data: first } = await b.rpc('complete_deep_talk_level', { p_pack_id: PACK_1, p_level_number: 1 })
  const { data: second } = await a.rpc('complete_deep_talk_level', { p_pack_id: PACK_1, p_level_number: 1 })
  ok('level completion: new once, then replay', first === true && second === false, `${first}/${second}`)

  // A shared device switching accounts moves the push endpoint.
  await c.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: 'k2', p_auth_key: 'a2' })
  const { data: bSubs } = await b.from('push_subscriptions').select('id').eq('endpoint', endpoint)
  ok('push endpoint moved to new account', (bSubs ?? []).length === 0)
  const { data: cSees } = await c.from('savings_goals').select('id').eq('couple_id', cid)
  ok('outsider cannot see savings', (cSees ?? []).length === 0)
  // Admins manage content and users, not other couples' private data.
  const { data: adminSavings } = await raka.from('savings_goals').select('id').eq('couple_id', cid)
  const { data: adminLetters } = await raka.from('letters').select('id').eq('couple_id', cid)
  ok('admin cannot read a couple\'s savings/letters', (adminSavings ?? []).length === 0 && (adminLetters ?? []).length === 0)
  const { error: dtWrite } = await b.from('deep_talk_packs').insert({ slug: 'hack', title: 'x' })
  ok('non-admin cannot write deep talk content', !!dtWrite)

  // --- Admin content management ------------------------------------------
  const { data: newPack, error: npE } = await raka.from('deep_talk_packs').insert({ slug: `verify-${Date.now()}`, title: 'Verify Pack' }).select().single()
  const { data: newLv } = await raka.from('deep_talk_levels').select('id, level_number').eq('pack_id', newPack?.id).order('level_number')
  ok('new pack gets 5 levels', !npE && newLv?.map((l) => l.level_number).join() === '1,2,3,4,5', npE?.message ?? JSON.stringify(newLv))
  const { error: qE } = await raka.from('deep_talk_questions').insert({ level_id: newLv?.[0]?.id, question_text: 'Q', sort_order: 1 })
  const { data: lvAfter } = await raka.from('deep_talk_levels').select('question_count').eq('id', newLv?.[0]?.id).single()
  ok('question_count trigger', !qE && lvAfter?.question_count === 1, qE?.message)
  await raka.from('deep_talk_packs').delete().eq('id', newPack?.id)

  // --- Storage ------------------------------------------------------------
  const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
  const up = await b.storage.from('avatars').upload(`${bid}/avatar.png`, blob, { upsert: true })
  ok('avatar upload own folder', !up.error, up.error?.message)
  const up2 = await b.storage.from('avatars').upload(`${aid}/avatar.png`, blob, { upsert: true })
  ok('avatar upload other folder blocked', !!up2.error)
  await admin.storage.from('avatars').remove([`${bid}/avatar.png`])

  // --- R4: couples and memberships change only through the RPCs ----------
  extraCouples.push(cid)
  const { data: dl, error: dlE } = await b.from('couples').delete().eq('id', cid).select()
  ok('member cannot delete the couple directly', !!dlE || (dl ?? []).length === 0, `deleted ${dl?.length}`)
  const { data: dm, error: dmE } = await b.from('couple_members').delete().eq('profile_id', bid).select()
  ok('member cannot delete their membership directly', !!dmE || (dm ?? []).length === 0, `deleted ${dm?.length}`)
  const { data: dmA } = await b.from('couple_members').delete().eq('profile_id', aid).select()
  ok("member cannot remove their partner's membership", (dmA ?? []).length === 0)
  const { data: coupleStill } = await admin.from('couples').select('id').eq('id', cid).maybeSingle()
  const { count: membersStill } = await admin.from('couple_members').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  ok('couple and both memberships intact', !!coupleStill && membersStill === 2, `members=${membersStill}`)
}

try {
  await main()
} catch (e) {
  failures.push(`crash: ${e.message}`)
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id)
  // Couples outlive their deleted creators (created_by is set null).
  for (const id of extraCouples) await admin.from('couples').delete().eq('id', id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('RLS FLOWS PASSED')
