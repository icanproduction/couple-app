// Two Truths & a Lie (leaf 1.2.2) against a LOCAL Supabase.
//   node scripts/verify/game-two-truths.mjs
// Throwaway users through the admin API: A + B (partners), C + D (another
// couple), E (no couple), F (waiting for a partner). Proves the security rule
// with negative tests: the guesser can't read lie_index or story before
// guessing (table, embeds, realtime, list RPC), the author can't guess, one
// guess only (also under a race), outsiders can do nothing, one open round per
// author, input validation, and a closed couple blocks new rounds and guesses.
// Also runs the client rules in src/components/games/two-truths/logic.ts.
// Prints "game two-truths verification passed" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// Node notes that logic.ts is ESM in a package without "type": "module"
// (harmless). Drop only that notice so the last line stays the verdict.
const printers = process.listeners('warning')
process.removeAllListeners('warning')
process.on('warning', (w) => { if (w?.code !== 'MODULE_TYPELESS_PACKAGE_JSON') for (const p of printers) p(w) })
const {
  STATEMENT_MAX, STORY_MAX, validateDraft, shuffleRound, parseRoundList, parseGuessResult,
  groupRounds, tallyLine, tallyWithGuess, errorCode, applyGuess,
} = await import('../../src/components/games/two-truths/logic.ts')

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

// ---------- local Supabase only ----------
const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u ?? '')
function readEnvFile(f) {
  const p = join(root, f)
  const out = {}
  if (!existsSync(p)) return out
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
// Take the keys from one file that points at the local stack (never mix a
// local URL with keys from a hosted project's file).
let env = null
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const e = readEnvFile(f)
  if (isLocal(e.NEXT_PUBLIC_SUPABASE_URL) && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY) env = e
}
if (!env) {
  const s = spawnSync('supabase', ['status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
  const e = {}
  for (const line of (s.stdout ?? '').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
    if (m) e[m[1]] = m[2]
  }
  if (isLocal(e.API_URL) && e.ANON_KEY && e.SERVICE_ROLE_KEY) {
    env = { NEXT_PUBLIC_SUPABASE_URL: e.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: e.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: e.SERVICE_ROLE_KEY }
  }
}
if (!env) {
  console.error('Refusing to run: no local Supabase URL + keys found (.env*.local or `supabase status`)')
  process.exit(1)
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anonClient = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

// ---------- tiny harness ----------
let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' :: ' + extra : ''}`) }
const created = []
const couples = new Set()
const SECRET = `SECRET-STORY-${Math.random().toString(36).slice(2, 8)}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (r) => r.error ? `${r.error.hint ?? r.error.code ?? ''} ${r.error.message}` : `data=${JSON.stringify(r.data)?.slice(0, 120)}`

async function makeUser(tag, name) {
  const email = `tt-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const password = 'verify-pass-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  created.push(data.user.id)
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`)
  return { client, id: data.user.id }
}
const call = (client, fn, args) => client.rpc(fn, args)
const create = (client, statements, lie, story = null) => call(client, 'two_truths_create', { p_statements: statements, p_lie_index: lie, p_story: story })
const guess = (client, id, index) => call(client, 'two_truths_guess', { p_round_id: id, p_index: index })
const cancel = (client, id) => call(client, 'two_truths_cancel', { p_round_id: id })
const list = (client) => call(client, 'two_truths_list')
const expectHint = (name, r, hint) => ok(name, r.error?.hint === hint, describe(r))
const row = async (id) => (await admin.from('two_truths_rounds').select('*').eq('id', id).maybeSingle()).data
const findIn = (r, id) => (r.data?.rounds ?? []).find((x) => x.id === id)

async function tableLockedDown(who, client, id) {
  const all = await client.from('two_truths_rounds').select('*')
  ok(`${who}: direct SELECT * on the table returns nothing`, !!all.error || (all.data ?? []).length === 0, describe(all))
  const secret = await client.from('two_truths_rounds').select('lie_index, story').eq('id', id)
  ok(`${who}: direct SELECT lie_index, story returns nothing`, !!secret.error || (secret.data ?? []).length === 0, describe(secret))
  ok(`${who}: direct SELECT is denied outright (no grant)`, all.error?.code === '42501' && secret.error?.code === '42501', `${all.error?.code} ${secret.error?.code}`)
  const embed = await client.from('couples').select('id, two_truths_rounds(lie_index, story)')
  const leaked = JSON.stringify(embed.data ?? []).includes(SECRET) || (embed.data ?? []).some((c) => (c.two_truths_rounds ?? []).length > 0)
  ok(`${who}: embedding rounds through couples leaks nothing`, !!embed.error || !leaked, describe(embed))
}

async function main() {
  const A = await makeUser('a', 'Ayu')
  const B = await makeUser('b', 'Bima')
  const C = await makeUser('c', 'Citra')
  const D = await makeUser('d', 'Dodi')
  const E = await makeUser('e', 'Eka')
  const F = await makeUser('f', 'Fajar')
  const anon = anonClient()

  const c1 = await A.client.rpc('create_couple')
  if (c1.error) throw new Error(`create_couple A: ${c1.error.message}`)
  couples.add(c1.data.id)
  const j1 = await B.client.rpc('join_couple', { p_code: c1.data.invite_code })
  if (j1.error) throw new Error(`join_couple B: ${j1.error.message}`)
  const c2 = await C.client.rpc('create_couple')
  if (c2.error) throw new Error(`create_couple C: ${c2.error.message}`)
  couples.add(c2.data.id)
  const j2 = await D.client.rpc('join_couple', { p_code: c2.data.invite_code })
  if (j2.error) throw new Error(`join_couple D: ${j2.error.message}`)
  const cF = await F.client.rpc('create_couple')
  if (cF.error) throw new Error(`create_couple F: ${cF.error.message}`)
  couples.add(cF.data.id)
  const cid = c1.data.id

  // ---------- realtime: B listens on the table itself; nothing may arrive ----------
  const heard = []
  const channel = B.client.channel(`tt-verify-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'two_truths_rounds' }, (p) => heard.push(p))
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 4000)
    channel.subscribe((status) => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); resolve() } })
  })

  // ---------- create ----------
  const storyA1 = `  The juggling one is the lie. ${SECRET}  `
  const a1 = await create(A.client, ['  I have never been to Bali  ', 'I once ate 12 sate in one go', 'I can juggle five oranges'], 2, storyA1)
  ok('A creates a round (uuid back)', !a1.error && /^[0-9a-f-]{36}$/.test(a1.data ?? ''), describe(a1))
  const a1Id = a1.data
  const a1Row = await row(a1Id)
  ok('stored trimmed, lie index and story kept, in A\'s couple', a1Row?.statements?.[0] === 'I have never been to Bali' && a1Row.lie_index === 2
    && a1Row.story === storyA1.trim() && a1Row.author_id === A.id && a1Row.couple_id === cid && a1Row.guessed_at === null, JSON.stringify(a1Row))
  const { data: act1 } = await admin.from('activities').select('kind, summary, url, actor_id').eq('ref_id', a1Id)
  ok('create writes one activity row with no secret text', act1?.length === 1 && act1[0].kind === 'two_truths' && act1[0].actor_id === A.id
    && act1[0].url === '/app/games/two-truths' && !/SECRET|juggle|Bali|sate/i.test(act1[0].summary), JSON.stringify(act1))

  // ---------- table + embeds + realtime locked for everyone ----------
  for (const [who, client] of [['anon', anon], ['author A', A.client], ['guesser B', B.client], ['outsider C', C.client], ['no-couple E', E.client]]) {
    await tableLockedDown(who, client, a1Id)
  }
  const ins = await A.client.from('two_truths_rounds').insert({ couple_id: cid, author_id: A.id, statements: ['x', 'y', 'z'], lie_index: 0 })
  ok('direct INSERT denied', !!ins.error, describe(ins))
  const upd = await B.client.from('two_truths_rounds').update({ guess_index: 2, guessed_at: new Date().toISOString() }).eq('id', a1Id).select()
  ok('direct UPDATE (fake a guess) denied', !!upd.error || (upd.data ?? []).length === 0, describe(upd))
  const del = await B.client.from('two_truths_rounds').delete().eq('id', a1Id).select()
  ok('direct DELETE denied', !!del.error || (del.data ?? []).length === 0, describe(del))
  ok('round untouched by direct writes', (await row(a1Id))?.guessed_at === null)
  await sleep(1500)
  ok('realtime on the table delivers nothing to the guesser', heard.length === 0, `${heard.length} events`)
  await B.client.removeChannel(channel)

  // ---------- list: guesser sees statements only ----------
  const bList = await list(B.client)
  const bRound = findIn(bList, a1Id)
  ok('B lists A\'s open round with the three statements', !bList.error && bRound?.statements?.length === 3 && bRound.statements[2] === 'I can juggle five oranges', describe(bList))
  ok('B: lie_index, story, correct are null before guessing', bRound?.lie_index === null && bRound?.story === null && bRound?.correct === null && bRound?.guess_index === null && bRound?.mine === false, JSON.stringify(bRound))
  ok('B: the raw list payload never carries the story', !JSON.stringify(bList.data).includes(SECRET))
  const bParsed = parseRoundList(bList.data)
  ok('client parse keeps the lie hidden for B', bParsed.rounds.find((r) => r.id === a1Id)?.lieIndex === null && groupRounds(bParsed.rounds).theirOpen?.id === a1Id)
  const aList = await list(A.client)
  const aRound = findIn(aList, a1Id)
  ok('A (author) sees own lie and story', aRound?.lie_index === 2 && aRound?.story === storyA1.trim() && aRound?.mine === true, JSON.stringify(aRound))
  ok('client groups A\'s round as my open round', groupRounds(parseRoundList(aList.data).rounds).myOpen?.id === a1Id)

  // ---------- author can't guess ----------
  expectHint('A cannot guess own round', await guess(A.client, a1Id, 2), 'TT_OWN_ROUND')
  ok('own-round guess changed nothing', (await row(a1Id))?.guessed_at === null)

  // ---------- one open round per author ----------
  expectHint('A cannot open a second round', await create(A.client, ['one', 'two', 'three'], 0), 'TT_OPEN_ROUND')
  const { count: aOpen } = await admin.from('two_truths_rounds').select('*', { count: 'exact', head: true }).eq('author_id', A.id).is('guessed_at', null)
  ok('A still has exactly one open round', aOpen === 1, String(aOpen))
  const [bx, by] = await Promise.all([
    create(B.client, ['B truth one', 'B truth two', 'B lie three'], 2, 'B story'),
    create(B.client, ['B other one', 'B other two', 'B other three'], 0),
  ])
  const bWins = [bx, by].filter((r) => !r.error)
  ok('two creates at once: exactly one goes through', bWins.length === 1 && [bx, by].some((r) => r.error?.hint === 'TT_OPEN_ROUND'), `${describe(bx)} | ${describe(by)}`)
  const b1Id = bWins[0]?.data

  // ---------- validation (DB) ----------
  const long = 'x'.repeat(STATEMENT_MAX + 1)
  const bad = [
    ['two statements', ['a', 'b'], 0, null],
    ['four statements', ['a', 'b', 'c', 'd'], 0, null],
    ['null statements', null, 0, null],
    ['empty statement', ['', 'b', 'c'], 0, null],
    ['whitespace-only statement', ['   ', 'b', 'c'], 0, null],
    ['null element', [null, 'b', 'c'], 0, null],
    [`statement over ${STATEMENT_MAX}`, [long, 'b', 'c'], 0, null],
    ['duplicate statements (case/space)', ['Same thing', ' same THING ', 'c'], 0, null],
    ['lie index -1', ['a', 'b', 'c'], -1, null],
    ['lie index 3', ['a', 'b', 'c'], 3, null],
    ['lie index null', ['a', 'b', 'c'], null, null],
    [`story over ${STORY_MAX}`, ['a', 'b', 'c'], 0, 's'.repeat(STORY_MAX + 1)],
  ]
  // C has a partner and no open round, so only validation can refuse these.
  for (const [label, st, lie, story] of bad) expectHint(`create rejects ${label}`, await create(C.client, st, lie, story), 'TT_INVALID')
  const { count: cRounds } = await admin.from('two_truths_rounds').select('*', { count: 'exact', head: true }).eq('couple_id', c2.data.id)
  ok('no invalid round was stored', cRounds === 0, String(cRounds))
  // Client mirror of the same rules.
  const v = (statements, lieIndex, story = '') => validateDraft({ statements, lieIndex, story })
  ok('client: valid draft passes', v(['a', 'b', 'c'], 1).length === 0 && v(['x'.repeat(STATEMENT_MAX), 'b', 'c'], 0, 's'.repeat(STORY_MAX)).length === 0)
  ok('client: rejects what the DB rejects', [
    v(['a', 'b'], 0), v(['', 'b', 'c'], 0), v(['  ', 'b', 'c'], 0), v([long, 'b', 'c'], 0),
    v(['Same thing', ' same THING ', 'c'], 0), v(['a', 'b', 'c'], null), v(['a', 'b', 'c'], 3), v(['a', 'b', 'c'], -1),
    v(['a', 'b', 'c'], 0, 's'.repeat(STORY_MAX + 1)),
  ].every((p) => p.length > 0))

  // ---------- outsiders ----------
  const cList = await list(C.client)
  ok('C (other couple) lists none of A+B\'s rounds', !cList.error && !findIn(cList, a1Id) && !findIn(cList, b1Id) && !JSON.stringify(cList.data).includes(SECRET), describe(cList))
  expectHint('C cannot guess A\'s round', await guess(C.client, a1Id, 2), 'TT_NOT_FOUND')
  expectHint('C cannot cancel A\'s round', await cancel(C.client, a1Id), 'TT_NOT_FOUND')
  const cMade = await create(C.client, ['C one', 'C two', 'C three'], 1)
  const cRow = cMade.data ? await row(cMade.data) : null
  ok('C\'s create lands in C\'s own couple only', !cMade.error && cRow?.couple_id === c2.data.id, describe(cMade))
  ok('A and B never see C\'s round', !findIn(await list(A.client), cMade.data) && !findIn(await list(B.client), cMade.data))
  const eList = await list(E.client)
  ok('E (no couple) lists nothing', !eList.error && Array.isArray(eList.data?.rounds) && eList.data.rounds.length === 0, describe(eList))
  expectHint('E cannot create', await create(E.client, ['e1', 'e2', 'e3'], 0), 'TT_NO_PARTNER')
  expectHint('E cannot guess', await guess(E.client, a1Id, 2), 'TT_NOT_FOUND')
  expectHint('E cannot cancel', await cancel(E.client, a1Id), 'TT_NOT_FOUND')
  expectHint('F (partner not joined yet) cannot create', await create(F.client, ['f1', 'f2', 'f3'], 0), 'TT_NO_PARTNER')
  for (const [label, r] of [
    ['list', await list(anon)], ['create', await create(anon, ['a', 'b', 'c'], 0)],
    ['guess', await guess(anon, a1Id, 2)], ['cancel', await cancel(anon, a1Id)],
  ]) ok(`anon cannot ${label} (no execute grant)`, !!r.error && !JSON.stringify(r).includes(SECRET), describe(r))
  ok('outsider attempts changed nothing', (await row(a1Id))?.guessed_at === null)

  // ---------- cancel ----------
  expectHint('B cannot cancel A\'s round', await cancel(B.client, a1Id), 'TT_NOT_AUTHOR')
  ok('A\'s round still there', !!(await row(a1Id)))
  const aCancel = await cancel(A.client, a1Id)
  ok('A cancels own open round', !aCancel.error, describe(aCancel))
  ok('canceled round is gone', (await row(a1Id)) === null)
  const { count: act1Left } = await admin.from('activities').select('*', { count: 'exact', head: true }).eq('ref_id', a1Id)
  ok('its activity row is gone too', act1Left === 0, String(act1Left))
  expectHint('canceling twice says not found', await cancel(A.client, a1Id), 'TT_NOT_FOUND')
  expectHint('guessing a canceled round says not found', await guess(B.client, a1Id, 0), 'TT_NOT_FOUND')

  // Edge lengths are accepted once the slot is free.
  const edge = 'y'.repeat(STATEMENT_MAX)
  const a2 = await create(A.client, [edge, 'A truth two', 'A lie three'], 2, 'z'.repeat(STORY_MAX))
  ok(`A creates again with a ${STATEMENT_MAX}-char statement and ${STORY_MAX}-char story`, !a2.error, describe(a2))
  const a2Id = a2.data

  // ---------- guess ----------
  for (const index of [3, -1, null]) expectHint(`guess index ${index} rejected`, await guess(B.client, a2Id, index), 'TT_INVALID')
  ok('bad guesses changed nothing', (await row(a2Id))?.guessed_at === null)
  const g1 = await guess(B.client, a2Id, 0)
  let g1Parsed = null
  try { g1Parsed = parseGuessResult(g1.data) } catch { /* reported below */ }
  ok('B guesses once: wrong, gets the lie and story back', !g1.error && g1.data?.correct === false && g1.data?.lie_index === 2 && g1.data?.story === 'z'.repeat(STORY_MAX) && g1Parsed?.guessIndex === 0, describe(g1))
  const a2Row = await row(a2Id)
  ok('guess stored with who and when', a2Row?.guess_index === 0 && a2Row.guessed_by === B.id && !!a2Row.guessed_at)
  expectHint('second guess refused', await guess(B.client, a2Id, 2), 'TT_ALREADY_GUESSED')
  ok('second guess changed nothing', (await row(a2Id))?.guess_index === 0)
  expectHint('a guessed round cannot be canceled', await cancel(A.client, a2Id), 'TT_ALREADY_GUESSED')
  const bAfter = findIn(await list(B.client), a2Id)
  ok('after the guess B sees the lie, the story and the result', bAfter?.lie_index === 2 && bAfter?.story === 'z'.repeat(STORY_MAX) && bAfter?.correct === false && bAfter?.guess_index === 0, JSON.stringify(bAfter)?.slice(0, 200))
  const aAfter = findIn(await list(A.client), a2Id)
  ok('after the guess A sees B\'s pick', aAfter?.guess_index === 0 && aAfter?.correct === false && !!aAfter?.guessed_at)
  const { data: act2 } = await admin.from('activities').select('summary, actor_id').eq('ref_id', a2Id).order('created_at')
  ok('guess writes a result activity (no secret text)', act2?.length === 2 && act2[1].actor_id === B.id && act2[1].summary === 'fell for the lie in Two Truths & a Lie', JSON.stringify(act2))

  // Two guesses at once: one wins, the other is told it's taken.
  const a3 = await create(A.client, ['Race one', 'Race two', 'Race three'], 1, `race ${SECRET}`)
  const [r0, r1] = await Promise.all([guess(B.client, a3.data, 0), guess(B.client, a3.data, 1)])
  const winners = [r0, r1].filter((r) => !r.error)
  const a3Row = await row(a3.data)
  ok('two guesses at once: exactly one counts', winners.length === 1 && [r0, r1].some((r) => r.error?.hint === 'TT_ALREADY_GUESSED')
    && a3Row?.guess_index === winners[0]?.data?.guess_index, `${describe(r0)} | ${describe(r1)}`)

  // A guess racing a cancel: never both.
  const a4 = await create(A.client, ['Cancel race one', 'Cancel race two', 'Cancel race three'], 0)
  const [gc, cc] = await Promise.all([guess(B.client, a4.data, 0), cancel(A.client, a4.data)])
  const a4Row = await row(a4.data)
  const consistent = (!gc.error && cc.error?.hint === 'TT_ALREADY_GUESSED' && a4Row?.guess_index === 0)
    || (!cc.error && gc.error?.hint === 'TT_NOT_FOUND' && a4Row === null)
  ok('guess racing cancel: exactly one wins, state matches', consistent, `${describe(gc)} | ${describe(cc)} | row=${JSON.stringify(a4Row)?.slice(0, 80)}`)
  if (a4Row && !a4Row.guessed_at) await cancel(A.client, a4.data)

  // A guesses B's round, correctly.
  const b1Row = await row(b1Id)
  const gB = await guess(A.client, b1Id, b1Row.lie_index)
  ok('A spots the lie in B\'s round', !gB.error && gB.data?.correct === true && gB.data?.story === (b1Row.story ?? null), describe(gB))
  const { data: actB } = await admin.from('activities').select('summary').eq('ref_id', b1Id).order('created_at')
  ok('spotted activity', actB?.[actB.length - 1]?.summary === 'spotted the lie in Two Truths & a Lie')

  // Tally matches the rows, both ways.
  const { data: rows1 } = await admin.from('two_truths_rounds').select('author_id, lie_index, guess_index, guessed_at').eq('couple_id', cid)
  const side = (author) => {
    const g = rows1.filter((r) => r.author_id === author && r.guessed_at)
    return { guessed: g.length, spotted: g.filter((r) => r.guess_index === r.lie_index).length }
  }
  const bTally = parseRoundList((await list(B.client)).data).tally
  const aTally = parseRoundList((await list(A.client)).data).tally
  const eqSide = (x, y) => x.guessed === y.guessed && x.spotted === y.spotted
  ok('B tally: you = A\'s rounds B guessed, partner = B\'s rounds A guessed', eqSide(bTally.you, side(A.id)) && eqSide(bTally.partner, side(B.id)), JSON.stringify({ bTally, a: side(A.id), b: side(B.id) }))
  ok('A tally mirrors B\'s', eqSide(aTally.you, bTally.partner) && eqSide(aTally.partner, bTally.you), JSON.stringify(aTally))
  ok('tally line reads "You spotted X of Y"', tallyLine(bTally.you, 'You') === `You spotted ${bTally.you.spotted} of ${bTally.you.guessed}` && tallyLine({ guessed: 0, spotted: 0 }, 'You') === 'No guesses yet')

  // ---------- closed couple ----------
  const b2 = await create(B.client, ['Closing one', 'Closing two', 'Closing three'], 1, `closing ${SECRET}`)
  ok('B opens a round before leaving', !b2.error, describe(b2))
  const a5 = await create(A.client, ['Left one', 'Left two', 'Left three'], 0)
  ok('A opens a round before B leaves', !a5.error, describe(a5))
  const left = await B.client.rpc('leave_couple')
  ok('B leaves (couple closes)', !left.error && left.data?.deleted === false, describe(left))
  const { data: closedCouple } = await admin.from('couples').select('closed_at').eq('id', cid).single()
  ok('couple is closed', !!closedCouple?.closed_at)
  expectHint('closed couple: A cannot create', await create(A.client, ['New one', 'New two', 'New three'], 0), 'TT_CLOSED')
  expectHint('closed couple: A cannot guess B\'s open round', await guess(A.client, b2.data, 1), 'TT_CLOSED')
  ok('closed couple: B\'s round stays unguessed', (await row(b2.data))?.guessed_at === null)
  const aClosed = await list(A.client)
  const b2Seen = findIn(aClosed, b2.data)
  ok('closed couple: A still reads the history', !aClosed.error && !!findIn(aClosed, a2Id) && !!findIn(aClosed, b1Id), describe(aClosed))
  ok('closed couple: the unguessed lie stays hidden', b2Seen?.lie_index === null && b2Seen?.story === null && !JSON.stringify(aClosed.data).includes(`closing ${SECRET}`))
  ok('closed couple: A may still cancel own open round', !(await cancel(A.client, a5.data)).error)
  const bGone = await list(B.client)
  ok('B, after leaving, sees none of the old rounds', !bGone.error && (bGone.data?.rounds ?? []).length === 0, describe(bGone))
  expectHint('B, after leaving, cannot guess there', await guess(B.client, a3.data, 0), 'TT_NOT_FOUND')

  // ---------- client rules ----------
  const input = ['first', 'second', 'third']
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length] }
  let follows = true
  const lieSpots = new Set()
  for (let n = 0; n < 300; n++) {
    const lie = n % 3
    const out = shuffleRound(input, lie)
    if (out.statements[out.lieIndex] !== input[lie] || [...out.statements].sort().join() !== [...input].sort().join()) follows = false
    if (lie === 2) lieSpots.add(out.lieIndex)
  }
  ok('shuffle is a permutation and the lie follows its statement', follows)
  ok('shuffle moves the lie to every position', lieSpots.size === 3, [...lieSpots].join())
  const fixed = shuffleRound(['  a ', 'b', 'c'], 0, seq([0, 0]))
  ok('shuffle trims and is deterministic for a given random source', fixed.statements.join() === 'b,c,a' && fixed.lieIndex === 2, JSON.stringify(fixed))
  ok('parseRoundList survives junk', parseRoundList(null).rounds.length === 0 && parseRoundList({ rounds: [{ id: 'x' }, 7] }).rounds.length === 0)
  let threw = false
  try { parseGuessResult({ correct: 'yes' }) } catch { threw = true }
  ok('parseGuessResult refuses a malformed reply', threw)
  ok('error codes map from hints and network failures', errorCode({ hint: 'TT_OPEN_ROUND' }) === 'TT_OPEN_ROUND'
    && errorCode({ message: 'TypeError: Failed to fetch' }) === 'NETWORK' && errorCode({ hint: 'other' }) === 'UNKNOWN')
  const base = parseRoundList({ rounds: [{ id: 'r', created_at: '2026-11-03T00:00:00Z', statements: ['a', 'b', 'c'], mine: false, lie_index: null, story: null, guess_index: null, guessed_at: null, correct: null }], tally: { you: { guessed: 1, spotted: 0 }, partner: { guessed: 0, spotted: 0 } } })
  const merged = applyGuess(base.rounds[0], { correct: true, lieIndex: 1, guessIndex: 1, story: 's' }, '2026-11-03T01:00:00Z')
  const bumped = tallyWithGuess(base.tally, { correct: true, lieIndex: 1, guessIndex: 1, story: 's' })
  ok('a fresh guess folds into the round and the tally', merged.lieIndex === 1 && merged.correct === true && !!merged.guessedAt && bumped.you.guessed === 2 && bumped.you.spotted === 1)
}

try { await main() } catch (e) { failures.push(`crash: ${e.stack ?? e.message}`) }
finally {
  // Rounds and activities go with their couples.
  const { data: leftovers } = await admin.from('couple_members').select('couple_id').in('profile_id', created)
  for (const m of leftovers ?? []) couples.add(m.couple_id)
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('game two-truths verification passed')
process.exit(0)
