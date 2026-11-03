// Love Languages check against a LOCAL Supabase.
//   node scripts/verify/game-love-languages.mjs
// 1. Question bank (src/components/games/love-languages/bank.ts): 20 pairs,
//    each key exactly 8 times, display names, tips, lengths, duplicates.
// 2. Scoring and helpers (the same code the page runs).
// 3. love_language_results: RLS, DB-side score validation (the database
//    recomputes scores from the answers with the same key map as bank.ts),
//    answers never readable, retake overwrites, closed couple.
// Throwaway users A, B (partners) and C (outsider, own couple) are created
// through the admin API and removed at the end.
// Prints "game love-languages verification passed" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import {
  LOVE_KEYS, LOVE_LANGUAGES, LOVE_PAIRS, LOVE_TIPS, QUESTION_COUNT, KEY_MAX,
  scoreAnswers, isLoveScores, rankKeys, pickTips, differenceLine,
} from '../../src/components/games/love-languages/bank.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

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
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' (' + extra + ')' : ''}`) }
const created = []
const couples = []

// jsonb keeps its own key order, so compare scores key by key.
const sameScores = (a, b) => !!a && !!b && LOVE_KEYS.every((k) => a[k] === b[k])
const randomAnswers = () => Array.from({ length: QUESTION_COUNT }, () => (Math.random() < 0.5 ? 0 : 1))

// ------------------------------------------------------------ question bank

function bank() {
  ok('five keys in order', LOVE_KEYS.join() === 'words,time,gifts,acts,touch')
  ok('display names', LOVE_KEYS.map((k) => LOVE_LANGUAGES[k].name).join('|') === 'Kind words|Quality time|Thoughtful gifts|Helping hands|Physical touch')
  ok('20 pairs', QUESTION_COUNT === 20 && LOVE_PAIRS.length === 20 && LOVE_PAIRS.every((p) => p.length === 2))
  const options = LOVE_PAIRS.flat()
  ok('40 options', options.length === 40)
  for (const key of LOVE_KEYS) {
    const n = options.filter((o) => o.key === key).length
    ok(`${key} appears exactly 8 times`, n === 8 && KEY_MAX === 8, `${n}`)
  }
  ok('no pair offers the same key twice', LOVE_PAIRS.every(([a, b]) => a.key !== b.key))
  const combos = new Map()
  for (const [a, b] of LOVE_PAIRS) {
    const k = [a.key, b.key].sort().join('+')
    combos.set(k, (combos.get(k) ?? 0) + 1)
  }
  ok('every combination of two keys comes up exactly twice', combos.size === 10 && [...combos.values()].every((n) => n === 2))
  const firstSlot = LOVE_KEYS.map((k) => LOVE_PAIRS.filter(([a]) => a.key === k).length)
  ok('each key is the first option 4 times (no position bias)', firstSlot.every((n) => n === 4), firstSlot.join(','))
  ok('back-to-back pairs never share a key', LOVE_PAIRS.every((p, i) => i === 0 || !p.some((o) => LOVE_PAIRS[i - 1].some((q) => q.key === o.key))))

  const texts = options.map((o) => o.text)
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  ok('no duplicate options', new Set(texts.map(norm)).size === texts.length)
  const badLen = texts.filter((t) => t.length < 10 || t.length > 100)
  ok('options are 10 to 100 characters', badLen.length === 0, badLen.join(' | '))

  const tipsOk = LOVE_KEYS.every((k) => LOVE_TIPS[k].length >= 5)
  ok('at least 5 tips per key', tipsOk, LOVE_KEYS.map((k) => `${k}=${LOVE_TIPS[k].length}`).join(' '))
  const allTips = LOVE_KEYS.flatMap((k) => LOVE_TIPS[k])
  ok('no duplicate tips', new Set(allTips.map(norm)).size === allTips.length)
  const badTips = allTips.filter((t) => t.length > 140 || !/[.]$/.test(t))
  ok('tips are short sentences', badTips.length === 0, badTips.join(' | '))
  const descriptions = LOVE_KEYS.map((k) => LOVE_LANGUAGES[k].description)
  ok('every key has a short line and a description', LOVE_KEYS.every((k) => LOVE_LANGUAGES[k].short.length > 3) && descriptions.every((d) => d.length > 40 && d.length <= 220))

  const everything = [...texts, ...allTips, ...descriptions, ...LOVE_KEYS.flatMap((k) => [LOVE_LANGUAGES[k].name, LOVE_LANGUAGES[k].short])]
  ok('no "5 Love Languages" trademark wording', !everything.some((t) => /\b(5|five)\s+love\s+languages?\b/i.test(t)))
  ok('no em dashes', !everything.some((t) => t.includes('—')))
  ok('no exclamation marks', !everything.some((t) => t.includes('!')))
  ok('American spelling', !everything.some((t) => /\b(favour|colour|realis|apologis|organis|honour|neighbour|centre|mum)\w*/i.test(t)))
}

// ------------------------------------------------------------ scoring

function scoring() {
  const sum = (s) => LOVE_KEYS.reduce((n, k) => n + s[k], 0)
  const zeros = scoreAnswers(Array(20).fill(0))
  const ones = scoreAnswers(Array(20).fill(1))
  ok('all first options: 4 each', LOVE_KEYS.every((k) => zeros[k] === 4))
  ok('all second options: 4 each', LOVE_KEYS.every((k) => ones[k] === 4))
  let allValid = true
  for (let i = 0; i < 200; i++) {
    const s = scoreAnswers(randomAnswers())
    if (!s || sum(s) !== 20 || !LOVE_KEYS.every((k) => s[k] >= 0 && s[k] <= 8) || !isLoveScores(s)) allValid = false
  }
  ok('random answers always score 0..8 per key, 20 in total', allValid)
  for (const key of LOVE_KEYS) {
    const max = LOVE_PAIRS.map(([a, b]) => (a.key === key ? 0 : b.key === key ? 1 : 0))
    ok(`${key} can reach 8`, scoreAnswers(max)[key] === 8)
  }
  ok('incomplete or invalid answers score null', scoreAnswers(Array(19).fill(0)) === null && scoreAnswers([...Array(19).fill(0), 2]) === null)
  ok('isLoveScores rejects bad shapes',
    !isLoveScores({ words: 4, time: 4, gifts: 4, acts: 4 })
    && !isLoveScores({ words: 4, time: 4, gifts: 4, acts: 4, touch: 4, extra: 0 })
    && !isLoveScores({ words: 9, time: 3, gifts: 4, acts: 4, touch: 0 })
    && !isLoveScores({ words: 4.5, time: 3.5, gifts: 4, acts: 4, touch: 4 })
    && !isLoveScores({ words: 5, time: 4, gifts: 4, acts: 4, touch: 4 })
    && !isLoveScores(null) && !isLoveScores([4, 4, 4, 4, 4]))
  ok('ranking: highest first, ties in key order',
    rankKeys({ words: 2, time: 6, gifts: 2, acts: 6, touch: 4 }).join() === 'time,acts,touch,words,gifts')

  const t0 = pickTips('time', 'seed-1', 0)
  const t1 = pickTips('time', 'seed-1', 1)
  ok('three distinct tips per key', t0.length === 3 && new Set(t0).size === 3 && t0.every((t) => LOVE_TIPS.time.includes(t)))
  ok('the same seed gives the same tips', pickTips('time', 'seed-1', 0).join() === t0.join())
  ok('"More ideas" shows other tips', LOVE_TIPS.time.length >= 6 ? t1.every((t) => !t0.includes(t)) : t1.join() !== t0.join())
  ok('a new seed (retake) can reorder the tips', ['a', 'b', 'c', 'd', 'e'].some((s) => pickTips('words', s).join() !== pickTips('words', 'seed-1').join()))

  const same = { words: 4, time: 4, gifts: 4, acts: 4, touch: 4 }
  ok('difference: identical scores', /match on all five/.test(differenceLine(same, same, 'Kezia')))
  ok('difference: small gap', /close on all five/.test(differenceLine(same, { words: 5, time: 3, gifts: 4, acts: 4, touch: 4 }, 'Kezia')))
  const partnerMore = differenceLine({ words: 1, time: 6, gifts: 4, acts: 4, touch: 5 }, { words: 7, time: 2, gifts: 4, acts: 3, touch: 4 }, 'Kezia')
  ok('difference: partner cares more', /^Kind words matters a lot more to Kezia \(7 of 8\) than to you \(1 of 8\)/.test(partnerMore), partnerMore)
  const meMore = differenceLine({ words: 1, time: 8, gifts: 4, acts: 4, touch: 3 }, { words: 4, time: 2, gifts: 4, acts: 6, touch: 4 }, 'Kezia')
  ok('difference: I care more', /^Quality time matters a lot more to you \(8 of 8\) than to Kezia \(2 of 8\)/.test(meMore), meMore)
}

// ------------------------------------------------------------ database

async function makeUser(tag) {
  const email = `ll-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const password = 'verify-pass-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Love ${tag}` } })
  if (error) throw error
  created.push(data.user.id)
  const client = mk()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { client, id: data.user.id }
}

async function database() {
  const A = await makeUser('a'), B = await makeUser('b'), C = await makeUser('c')
  const { data: couple, error: cE } = await A.client.rpc('create_couple')
  if (cE) throw cE
  couples.push(couple.id)
  const { error: jE } = await B.client.rpc('join_couple', { p_code: couple.invite_code })
  if (jE) throw jE
  const { data: other, error: oE } = await C.client.rpc('create_couple')
  if (oE) throw oE
  couples.push(other.id)
  const cid = couple.id
  const T = 'love_language_results'
  const COLS = 'profile_id, couple_id, scores, taken_at'
  const row = (who, answers, extra = {}) => ({ profile_id: who.id, couple_id: cid, scores: scoreAnswers(answers), answers, ...extra })
  // The page's save path: update my row, insert when there is none yet.
  // (An upsert can't work by design: it would need read access to answers.)
  const upsert = async (who, payload) => {
    const { profile_id, ...change } = payload
    const up = await who.client.from(T).update(change).eq('profile_id', profile_id).select(COLS)
    if (up.error) return { data: null, error: up.error }
    if (up.data?.length) return { data: up.data[0], error: null }
    return who.client.from(T).insert(payload).select(COLS).single()
  }

  // Take the quiz.
  const aAnswers = randomAnswers()
  const { data: aRow, error: aErr } = await upsert(A, row(A, aAnswers))
  ok('member saves a result', !aErr && aRow?.profile_id === A.id, aErr?.message)
  ok('saved scores match the client scoring', sameScores(aRow?.scores, scoreAnswers(aAnswers)))
  const { data: stored } = await admin.from(T).select('answers, taken_at').eq('profile_id', A.id).single()
  ok('answers are stored as given', JSON.stringify(stored?.answers) === JSON.stringify(aAnswers))

  // Who can read what.
  const { data: bSeesA } = await B.client.from(T).select(COLS).eq('profile_id', A.id)
  ok('partner reads my scores', bSeesA?.length === 1 && sameScores(bSeesA[0].scores, aRow?.scores))
  const { error: bAnswers } = await B.client.from(T).select('answers').eq('profile_id', A.id)
  ok('partner cannot read my individual answers', !!bAnswers)
  const { error: aAnswersErr } = await A.client.from(T).select('answers').eq('profile_id', A.id)
  ok('answers are not readable through the API at all', !!aAnswersErr)
  const { data: cSees } = await C.client.from(T).select(COLS)
  ok('outsider reads no results', (cSees ?? []).length === 0)
  const anon = mk()
  const { data: anonSees, error: anonErr } = await anon.from(T).select('scores')
  ok('anonymous visitors read nothing', !!anonErr || (anonSees ?? []).length === 0)
  const { data: probe, error: probeErr } = await C.client.rpc('love_language_in_open_couple', { p_couple: cid })
  ok('the open-couple helper says nothing about other couples', !probeErr && probe === false, probeErr?.message)

  // Writing for someone else, or into another couple.
  const { error: cAsA } = await C.client.from(T).insert(row(A, randomAnswers()))
  const { data: cUpdA } = await C.client.from(T).update({ scores: scoreAnswers(Array(20).fill(1)), answers: Array(20).fill(1) }).eq('profile_id', A.id).select('profile_id')
  ok('outsider cannot write a result for me', !!cAsA && (cUpdA ?? []).length === 0)
  const { error: cIntoUs } = await C.client.from(T).insert({ ...row(C, randomAnswers()), couple_id: cid })
  ok('outsider cannot save into our couple', !!cIntoUs)
  const { error: bAsA } = await B.client.from(T).insert(row(A, Array(20).fill(1)))
  ok('partner cannot insert a result for me', !!bAsA)
  const { data: bUpd } = await B.client.from(T).update({ scores: scoreAnswers(Array(20).fill(1)), answers: Array(20).fill(1) }).eq('profile_id', A.id).select('profile_id')
  const { data: afterSpoof } = await admin.from(T).select('scores').eq('profile_id', A.id).single()
  ok('partner cannot update my row', (bUpd ?? []).length === 0 && sameScores(afterSpoof.scores, aRow.scores))
  const { error: aIntoC } = await upsert(A, { ...row(A, randomAnswers()), couple_id: other.id })
  ok('cannot save into a couple I am not in', !!aIntoC)
  const { error: stampErr } = await A.client.from(T).update({ taken_at: '2020-01-01T00:00:00Z' }).eq('profile_id', A.id)
  ok('taken_at cannot be set by the client', !!stampErr)
  const { error: moveErr } = await A.client.from(T).update({ profile_id: B.id }).eq('profile_id', A.id)
  ok('a result cannot be moved to another person', !!moveErr)
  const { error: upsertErr } = await A.client.from(T).upsert(row(A, aAnswers), { onConflict: 'profile_id' })
  ok('upsert is refused (it would read the private answers)', !!upsertErr)
  const { error: fakeUpdate } = await A.client.from(T).update({ scores: { words: 8, time: 0, gifts: 4, acts: 4, touch: 4 }, answers: Array(20).fill(0) }).eq('profile_id', A.id)
  ok('an update with scores that disagree with the answers is rejected', !!fakeUpdate)
  const { data: delRows, error: delErr } = await A.client.from(T).delete().eq('profile_id', A.id).select('profile_id')
  const { count: stillThere } = await admin.from(T).select('*', { count: 'exact', head: true }).eq('profile_id', A.id)
  ok('results cannot be deleted by users', (!!delErr || (delRows ?? []).length === 0) && stillThere === 1)

  // Invalid scores and answers are rejected by the database.
  const good = Array(20).fill(0) // 4 each
  const bad = [
    ['a missing key', { scores: { words: 4, time: 4, gifts: 4, acts: 8 }, answers: good }],
    ['an extra key', { scores: { words: 4, time: 4, gifts: 4, acts: 4, touch: 4, hugs: 0 }, answers: good }],
    ['a score of 9', { scores: { words: 9, time: 3, gifts: 4, acts: 4, touch: 0 }, answers: good }],
    ['a negative score', { scores: { words: -1, time: 5, gifts: 4, acts: 4, touch: 8 }, answers: good }],
    ['a fractional score', { scores: { words: 4.5, time: 3.5, gifts: 4, acts: 4, touch: 4 }, answers: good }],
    ['a score written as 4.0', { scores: { words: 4.0, time: 4, gifts: 4, acts: 4, touch: '4' }, answers: good }],
    ['a score as a string', { scores: { words: '4', time: 4, gifts: 4, acts: 4, touch: 4 }, answers: good }],
    ['scores that add up to 21', { scores: { words: 5, time: 4, gifts: 4, acts: 4, touch: 4 }, answers: good }],
    ['valid-looking scores that disagree with the answers', { scores: { words: 8, time: 0, gifts: 4, acts: 4, touch: 4 }, answers: good }],
    ['scores as an array', { scores: [4, 4, 4, 4, 4], answers: good }],
    ['19 answers', { scores: { words: 4, time: 4, gifts: 4, acts: 4, touch: 4 }, answers: good.slice(1) }],
    ['21 answers', { scores: { words: 4, time: 4, gifts: 4, acts: 4, touch: 4 }, answers: [...good, 0] }],
    ['an answer of 2', { scores: { words: 4, time: 4, gifts: 4, acts: 4, touch: 4 }, answers: [2, ...good.slice(1)] }],
    ['an empty answer', { scores: { words: 4, time: 4, gifts: 4, acts: 4, touch: 4 }, answers: [null, ...good.slice(1)] }],
    ['no answers', { scores: { words: 4, time: 4, gifts: 4, acts: 4, touch: 4 }, answers: [] }],
  ]
  for (const [label, extra] of bad) {
    const { error } = await upsert(B, { profile_id: B.id, couple_id: cid, ...extra })
    ok(`rejected: ${label}`, !!error)
  }
  const { count: bRows } = await admin.from(T).select('*', { count: 'exact', head: true }).eq('profile_id', B.id)
  ok('no invalid row slipped through', bRows === 0)

  // The database key map agrees with bank.ts, and retakes overwrite.
  let agree = true
  let lastStamp = stored.taken_at
  let stampsMove = true
  for (let i = 0; i < 25; i++) {
    const answers = randomAnswers()
    const { data, error } = await upsert(B, row(B, answers))
    if (error || !sameScores(data?.scores, scoreAnswers(answers))) { agree = false; break }
    if (i > 0 && !(data.taken_at >= lastStamp)) stampsMove = false
    lastStamp = data.taken_at
  }
  ok('every set of answers scored by bank.ts is accepted (same key map as the database)', agree)
  for (const key of LOVE_KEYS) {
    const max = LOVE_PAIRS.map(([a, b]) => (a.key === key ? 0 : b.key === key ? 1 : 0))
    const { error } = await upsert(B, row(B, max))
    ok(`database accepts 8 for ${key}`, !error, error?.message)
  }
  const { count: bOne } = await admin.from(T).select('*', { count: 'exact', head: true }).eq('profile_id', B.id)
  ok('a retake overwrites (one row per person)', bOne === 1)
  ok('taken_at moves forward on a retake', stampsMove)

  const { data: both } = await A.client.from(T).select('profile_id').eq('couple_id', cid)
  ok('both results visible inside the couple', both?.length === 2)

  // Closed couple: archive stays readable to the one who stayed, no new writes.
  const { error: leaveErr } = await B.client.rpc('leave_couple')
  ok('partner leaves (couple closes)', !leaveErr, leaveErr?.message)
  const { error: closedWrite } = await upsert(A, row(A, randomAnswers()))
  ok('no retakes in a closed couple', !!closedWrite)
  const { data: aOwn } = await A.client.from(T).select(COLS).eq('profile_id', A.id)
  ok('the remaining member still reads their own result', aOwn?.length === 1)
  const { data: aSeesB } = await A.client.from(T).select(COLS).eq('profile_id', B.id)
  ok('the result of the partner who left is no longer visible', (aSeesB ?? []).length === 0)
  const { data: bSeesAAfter } = await B.client.from(T).select(COLS).eq('profile_id', A.id)
  ok('the partner who left no longer sees mine', (bSeesAAfter ?? []).length === 0)
  const { data: bOwn } = await B.client.from(T).select(COLS).eq('profile_id', B.id)
  ok('the partner who left still sees their own', bOwn?.length === 1)
  const { error: bWriteOld } = await upsert(B, row(B, randomAnswers()))
  ok('the partner who left cannot write into the old couple', !!bWriteOld)
}

try {
  bank()
  scoring()
  await database()
} catch (e) {
  failures.push(`crash: ${e.message}`)
} finally {
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('game love-languages verification passed')
