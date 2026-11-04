// Samakan v2 (leaf w1-sam) against a LOCAL Supabase.
//   node scripts/verify/game-samakan.mjs
// Covers spec docs/superpowers/specs/2026-11-04-samakan-remake.md gates 1-11,
// 23, 25 (DB), 26 and 27 (bank), plus Eric's two additions: the "Play now
// together" live invite and the couple switch for personal (AI) rounds.
//
// Throwaway users through the admin API: A + B (partners), C + D (second couple,
// stats fixture), G + H (push rules), E (no couple), F (waiting for a partner).
// Proves with negative tests that a partner's answer can't be read before you
// answer (table, embeds, realtime, every RPC), that both phones get the same
// rounds, the scoring/reveal/skip/lock/expiry rules, races, weekly streak on
// Jakarta weeks, legacy game_sessions read-only, the monthly recap count, the
// live-invite and push limits, and the shape of the curated bank. Also re-applies
// the migration to prove it is re-runnable.
// Prints "game samakan verification passed" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import module, { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// Node notes that the .ts files are ESM in a package without "type": "module"
// (harmless). Drop only that notice so the last line stays the verdict.
const printers = process.listeners('warning')
process.removeAllListeners('warning')
process.on('warning', (w) => { if (w?.code !== 'MODULE_TYPELESS_PACKAGE_JSON') for (const p of printers) p(w) })

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const MIGRATION = join(root, 'supabase', 'migrations', '20261104121000_samakan_v2.sql')

// recap.ts imports '@/lib/supabase' (a browser client) and '@/lib/moments'.
// Resolve '@/' to src/ and swap those two for stubs, so the real loadRecap runs
// here against the signed-in test client.
const srcUrl = pathToFileURL(join(root, 'src') + '/').href
const STUBS = {
  '@/lib/supabase': 'export function createClient() { return globalThis.__samakanRecapClient }',
  '@/lib/moments': "export const MOMENTS_BUCKET = 'moments'",
}
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true }
    if (specifier.startsWith('@/')) return nextResolve(new URL(`${specifier.slice(2)}.ts`, srcUrl).href, context)
    return nextResolve(specifier, context)
  },
})

const L = await import('../../src/components/games/samakan/logic.ts')
const { SAMAKAN_BANK } = await import('../../src/data/samakan-bank.ts')
const { loadRecap, monthRange } = await import('../../src/lib/recap.ts')

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

function psql(sql, file) {
  const input = file ? readFileSync(file, 'utf8') : sql
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_couple-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.error}`)
  return r.stdout.trim()
}

// ---------- tiny harness ----------
let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' :: ' + extra : ''}`) }
const created = []
const couples = new Set()
const channels = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (r) => r?.error ? `${r.error.hint ?? r.error.code ?? ''} ${r.error.message}` : `data=${JSON.stringify(r?.data)?.slice(0, 160)}`
const expectHint = (name, r, hint) => ok(name, r.error?.hint === hint, describe(r))
const denied = (r) => !!r.error && (r.error.code === '42501' || /permission denied/i.test(r.error.message ?? ''))
const noRows = (r) => !!r.error || (r.data ?? []).length === 0

// Seeded random source (mulberry32) so bank picks are reproducible.
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function makeUser(tag, name) {
  const email = `sk-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const password = 'verify-pass-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  created.push(data.user.id)
  const client = anonClient()
  const { data: s, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`)
  // Realtime must carry the user's JWT so postgres_changes applies RLS as them.
  await client.realtime.setAuth(s.session.access_token)
  return { client, id: data.user.id }
}

async function pair(x, y) {
  const c = await x.client.rpc('create_couple')
  if (c.error) throw new Error(`create_couple: ${c.error.message}`)
  couples.add(c.data.id)
  const j = await y.client.rpc('join_couple', { p_code: c.data.invite_code })
  if (j.error) throw new Error(`join_couple: ${j.error.message}`)
  return c.data.id
}

const hub = (u) => u.client.rpc('samakan_hub')
const state = (u, setId) => u.client.rpc('samakan_set_state', { p_set_id: setId })
const answer = (u, roundId, pick, guess = null) => u.client.rpc('samakan_answer', { p_round_id: roundId, p_pick: pick, p_guess: guess })
const skip = (u, roundId) => u.client.rpc('samakan_skip', { p_round_id: roundId })
const endSet = (u, setId) => u.client.rpc('samakan_end', { p_set_id: setId })
const invite = (u, setId) => u.client.rpc('samakan_live_invite', { p_set_id: setId })
const accept = (u, inviteId) => u.client.rpc('samakan_live_accept', { p_invite_id: inviteId })
const setPersonal = (u, on) => u.client.rpc('samakan_set_personal', { p_on: on })
const insertSet = (client, couple, creator, source, theme, reason, rounds) =>
  client.rpc('samakan_insert_set', { p_couple: couple, p_creator: creator, p_source: source, p_theme: theme, p_reason: reason, p_rounds: rounds })
const claimPush = (setId, recipient, kind) => admin.rpc('samakan_claim_push', { p_set_id: setId, p_recipient: recipient, p_kind: kind })
const setRow = async (id) => (await admin.from('samakan_sets').select('*').eq('id', id).maybeSingle()).data
const roundRows = async (setId) => (await admin.from('samakan_rounds').select('*').eq('set_id', setId).order('position')).data ?? []
const bankSet = (theme, seed, history = {}) => L.pickBankRounds({ bank: SAMAKAN_BANK, theme, history, random: seeded(seed) })
async function newSet(couple, creator, theme, seed) {
  const r = await insertSet(admin, couple, creator, 'bank', theme, null, bankSet(theme, seed))
  if (r.error || r.data?.existing) throw new Error(`insert ${theme}: ${describe(r)}`)
  return { id: r.data.id, rounds: await roundRows(r.data.id) }
}
function listen(client, table, filter, sink, event = '*') {
  return new Promise((resolve, reject) => {
    const ch = client.channel(`sk-${table}-${Math.random().toString(36).slice(2, 8)}`)
    ch.on('postgres_changes', { event, schema: 'public', table, ...(filter ? { filter } : {}) }, (p) => sink.push(p))
    const t = setTimeout(() => reject(new Error(`${table}: subscribe timeout`)), 10_000)
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); channels.push([client, ch]); resolve(ch) }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); reject(new Error(`${table}: ${status} ${err?.message ?? ''}`)) }
    })
  })
}

// ============================================================
// Bank shape (gate 27 bank) and the pure rules
// ============================================================

function checkBank() {
  const bank = SAMAKAN_BANK
  ok('bank: 120 rounds', bank.length === 120, String(bank.length))
  ok('bank: ids unique', new Set(bank.map((r) => r.id)).size === bank.length)
  const idShape = bank.every((r) => {
    const m = r.id.match(/^(food|weekends|home|travel|habits|plans)-([mgs])(\d{2})$/)
    return m && m[1] === r.theme && m[2] === r.kind[0]
  })
  ok('bank: ids read theme-kind-number and match their round', idShape)
  const byTheme = Object.fromEntries(L.BANK_THEMES.map((t) => [t, bank.filter((r) => r.theme === t)]))
  ok('bank: exactly the 6 themes', Object.keys(byTheme).length === 6 && bank.every((r) => L.BANK_THEMES.includes(r.theme)))
  ok('bank: 20 rounds per theme', Object.values(byTheme).every((rs) => rs.length === 20), JSON.stringify(Object.fromEntries(Object.entries(byTheme).map(([k, v]) => [k, v.length]))))
  for (const kind of ['match', 'guess', 'scale']) ok(`bank: 40 ${kind} rounds`, bank.filter((r) => r.kind === kind).length === 40)
  ok('bank: every theme can deal a full set from its own rounds (2 match, 3 guess, 2 scale)',
    Object.values(byTheme).every((rs) => rs.filter((r) => r.kind === 'match').length >= 2 && rs.filter((r) => r.kind === 'guess').length >= 3 && rs.filter((r) => r.kind === 'scale').length >= 2))
  const problems = []
  for (const r of bank) {
    const position = L.KIND_ORDER.indexOf(r.kind)
    const p = L.draftProblems(L.bankDraft(r, seeded(1)), position)
    if (p.length) problems.push(`${r.id}: ${p.join(', ')}`)
  }
  ok('bank: every round passes the insert rules and the safety blocklist', problems.length === 0, problems.slice(0, 5).join(' | '))
  const texts = bank.flatMap((r) => [r.prompt, r.talk, ...(r.kind === 'scale' ? [r.low, r.high] : r.options)])
  ok('bank: no em dash anywhere', texts.every((t) => !t.includes('—')))
  ok('bank: no hyphenated words', texts.every((t) => !/\b[a-z]{2,}-[a-z]{2,}\b/i.test(t)), texts.filter((t) => /\b[a-z]{2,}-[a-z]{2,}\b/i.test(t)).join(' | '))
  ok('bank: no percent signs (no percentages anywhere in Samakan)', texts.every((t) => !t.includes('%')))
  ok('bank: no luck rounds and no role-play', bank.every((r) => !/\b(pick a number|random|lucky|luck|coin|dice|pretend|imagine|role ?play|say it's)\b/i.test(`${r.prompt} ${r.talk}`)))
  ok('bank: every round has a talk line ending in ? or .', bank.every((r) => r.talk.trim().length >= 10 && r.talk.length <= L.TALK_MAX && /[?.]$/.test(r.talk)))
  const dupes = []
  for (let i = 0; i < bank.length; i++) {
    if (L.isNearDuplicate(bank[i].prompt, bank.slice(i + 1).map((r) => r.prompt))) dupes.push(bank[i].id)
  }
  ok('bank: no duplicate or near-duplicate prompts', dupes.length === 0, dupes.join(', '))
  ok('bank: scale labels are distinct ends', bank.filter((r) => r.kind === 'scale').every((r) => r.low.toLowerCase() !== r.high.toLowerCase()))
}

function checkLogic() {
  const s = (kind, a, b) => L.scoreRound(kind, a, b)
  ok('score: match +1 when equal, 0 otherwise, max 1', s('match', { pick: 1, guess: null }, { pick: 1, guess: null }).score === 1
    && s('match', { pick: 0, guess: null }, { pick: 1, guess: null }).score === 0 && s('match', { pick: 0, guess: null }, { pick: 0, guess: null }).max === 1)
  const g = s('guess', { pick: 2, guess: 1 }, { pick: 1, guess: 3 })
  ok('score: guess +1 per correct guess, wrong option is new', g.score === 1 && g.learned === 1 && g.max === 2, JSON.stringify(g))
  const sc = s('scale', { pick: 4, guess: 2 }, { pick: 3, guess: 4 })
  ok('score: scale exact +1, off by one is close (0 points, not new)', sc.score === 1 && sc.learned === 0, JSON.stringify(sc))
  const far = s('scale', { pick: 1, guess: 5 }, { pick: 2, guess: 4 })
  ok('score: scale off by 2+ is new', far.score === 0 && far.learned === 2, JSON.stringify(far))
  const rv = L.revealRound('scale', { pick: 4, guess: 2 }, { pick: 3, guess: 4 })
  ok('reveal marks: my close guess, partner read me right', rv.myGuess === 'close' && rv.partnerGuess === 'right' && L.MARK_LABELS[rv.myGuess] === 'Close' && L.MARK_LABELS.right === 'Read you right')
  ok('max per set is 12 and a skip drops its own max', L.MAX_PER_SET === 12 && L.setMax(L.KIND_ORDER.map((kind) => ({ kind, skipped: false }))) === 12
    && L.setMax(L.KIND_ORDER.map((kind, i) => ({ kind, skipped: i === 2 || i === 4 }))) === 9)
  ok('validateAnswer mirrors the DB ranges', L.validateAnswer('match', 1, null) === null && L.validateAnswer('match', 2, null) !== null
    && L.validateAnswer('match', 0, 1) !== null && L.validateAnswer('guess', 3, 0) === null && L.validateAnswer('guess', 3, null) !== null
    && L.validateAnswer('guess', 4, 0) !== null && L.validateAnswer('scale', 5, 1) === null && L.validateAnswer('scale', 0, 3) !== null
    && L.validateAnswer('scale', 3, 6) !== null && !L.canLockIn('guess', 1, null) && L.canLockIn('scale', 2, 2))

  // Jakarta weeks: Monday 03:00 Jakarta is still Sunday in UTC.
  ok('jakartaWeekStart uses Jakarta time, Monday start', L.jakartaWeekStart('2026-11-01T20:00:00Z') === '2026-11-02'
    && L.jakartaWeekStart('2026-11-01T16:59:00Z') === '2026-10-26' && L.jakartaDate('2026-11-03T18:30:00Z') === '2026-11-04')
  const now = new Date('2026-11-04T05:00:00Z') // Wednesday in Jakarta, week of 2 Nov
  ok('streak: this week empty does not break it', L.weeklyStreak(['2026-10-26T03:00:00Z', '2026-10-19T03:00:00Z'], now) === 2)
  ok('streak: counts this week once it has a set', L.weeklyStreak(['2026-11-03T03:00:00Z', '2026-10-26T03:00:00Z'], now) === 2)
  ok('streak: a gap week ends it', L.weeklyStreak(['2026-10-26T03:00:00Z', '2026-10-12T03:00:00Z'], now) === 1 && L.weeklyStreak(['2026-10-12T03:00:00Z'], now) === 0)
  ok('streak: Monday 00:30 Jakarta (Sunday in UTC) lands in its Jakarta week', L.weeklyStreak(['2026-10-25T17:30:00Z', '2026-10-19T03:00:00Z'], now) === 2)
  const best = L.bestSet([
    { id: 'a', status: 'done', matches: 11, maxMatches: 12, revealed: 7, at: '2026-10-01T00:00:00Z' },
    { id: 'b', status: 'done', matches: 11, maxMatches: 12, revealed: 7, at: '2026-10-08T00:00:00Z' },
    { id: 'c', status: 'ended', matches: 4, maxMatches: 4, revealed: 4, at: '2026-10-09T00:00:00Z' },
    { id: 'd', status: 'open', matches: 2, maxMatches: 2, revealed: 1, at: '2026-10-10T00:00:00Z' },
  ])
  ok('best: highest ratio among 5+ revealed, ties to the latest', best?.id === 'b', JSON.stringify(best))

  // Bank pick
  const drafts = bankSet('food', 7)
  ok('pick: 7 rounds in kind order', drafts.length === 7 && drafts.every((d, i) => d.kind === L.KIND_ORDER[i]))
  ok('pick: unseen theme rounds first', drafts.every((d) => d.bank_id?.startsWith('food-')))
  ok('pick: deterministic for one random source', JSON.stringify(bankSet('food', 7)) === JSON.stringify(drafts))
  ok('pick: no round twice in a set', new Set(drafts.map((d) => d.bank_id)).size === 7)
  const byId = new Map(SAMAKAN_BANK.map((r) => [r.id, r]))
  ok('pick: guess options are a permutation of the bank options', drafts.filter((d) => d.kind === 'guess')
    .every((d) => [...d.options].sort().join('|') === [...byId.get(d.bank_id).options].sort().join('|')))
  let moved = false
  for (let seed = 1; seed < 40 && !moved; seed++) {
    const d = L.bankDraft(byId.get('food-g01'), seeded(seed))
    if (d.options.join('|') !== byId.get('food-g01').options.join('|')) moved = true
  }
  ok('pick: guess options really get shuffled', moved)
  const t0 = new Date('2026-11-04T00:00:00Z')
  const recent = Object.fromEntries(SAMAKAN_BANK.filter((r) => r.theme === 'food').map((r) => [r.id, '2026-10-20T00:00:00Z']))
  const fallback = L.pickBankRounds({ bank: SAMAKAN_BANK, theme: 'food', history: recent, now: t0, random: seeded(3) })
  ok('pick: a dry theme borrows unseen rounds from other themes before repeating', fallback.every((d) => !d.bank_id.startsWith('food-')), fallback.map((d) => d.bank_id).join())
  const allRecent = Object.fromEntries(SAMAKAN_BANK.map((r, i) => [r.id, new Date(t0.getTime() - (i + 1) * 3600_000).toISOString()]))
  const dry = L.pickBankRounds({ bank: SAMAKAN_BANK, theme: 'mixed', history: allRecent, now: t0, random: seeded(4) })
  const oldestByKind = (kind, n) => SAMAKAN_BANK.map((r, i) => ({ r, i })).filter((x) => x.r.kind === kind).sort((a, b) => b.i - a.i).slice(0, n).map((x) => x.r.id)
  ok('pick: a dry bank deals the oldest-used rounds first', dry.filter((d) => d.kind === 'match').map((d) => d.bank_id).sort().join() === oldestByKind('match', 2).sort().join()
    && dry.filter((d) => d.kind === 'guess').map((d) => d.bank_id).sort().join() === oldestByKind('guess', 3).sort().join())
  const old = Object.fromEntries(SAMAKAN_BANK.map((r) => [r.id, '2026-08-01T00:00:00Z']))
  const back = L.pickBankRounds({ bank: SAMAKAN_BANK, theme: 'travel', history: old, now: t0, random: seeded(5) })
  ok('pick: rounds seen more than 60 days ago are fresh again', back.every((d) => d.bank_id.startsWith('travel-')))

  // Read-out template, parsers, errors
  const rounds = [
    { kind: 'match', skipped: false, talk: 'Match talk?', mine: { pick: 0, guess: null }, partner: { pick: 0, guess: null } },
    { kind: 'guess', skipped: false, talk: 'Guess talk?', mine: { pick: 1, guess: 2 }, partner: { pick: 3, guess: 0 } },
    { kind: 'scale', skipped: true, talk: 'Skipped talk?', mine: null, partner: null },
  ]
  const tr = L.templateReadout(rounds)
  ok('template read-out: counts, biggest miss, no percent', tr.headline === '1 of 3 matches' && tr.note.startsWith('2 new things') && tr.ask === 'Guess talk?' && tr.by === 'template' && !/%/.test(JSON.stringify(tr)), JSON.stringify(tr))
  ok('result and streak lines', L.resultLine(9, 12, 3) === '9 of 12 matches. 3 new things you learned about each other.' && L.resultLine(1, 1, 0) === '1 of 1 match.'
    && L.streakLine(3) === '3 weeks in a row' && L.streakLine(0) === null)
  ok('error codes map from hints and network failures', L.errorCode({ hint: 'SK_LOCKED' }) === 'SK_LOCKED' && L.errorCode({ message: 'TypeError: Failed to fetch' }) === 'NETWORK'
    && L.errorCode({ hint: 'TT_AUTH' }) === 'UNKNOWN' && !L.errorMessage('SK_LOCKED').includes('—'))
  let threw = 0
  for (const fn of [() => L.parseHub(null), () => L.parseSetState({}), () => L.parseAnswerResult({ revealed: true }), () => L.parseLiveInviteResult(7)]) {
    try { fn() } catch { threw++ }
  }
  ok('parsers refuse malformed replies', threw === 4)
  ok('safety blocklist catches each rule', ['How jealous do you get?', 'Rate your ex', 'Your salary?', 'Church or mosque?', 'Beer or wine?', 'Your most annoying habit?', 'You\'ve been sad lately']
    .every((t) => L.safetyIssues(t).length > 0) && L.safetyIssues('How spicy can you go?').length === 0)
  ok('draft rules flag order, counts, dashes', L.draftProblems({ kind: 'guess', prompt: 'Too short', options: ['a', 'A', 'b', 'c'], low: null, high: null, talk: '', source: 'general', bank_id: null }, 0).length >= 2
    && L.draftProblems({ kind: 'match', prompt: 'Dinner tonight — or not?', options: ['x', 'y'], low: null, high: null, talk: '', source: 'general', bank_id: null }, 0).includes('long dash'))
}

// ============================================================
// Database
// ============================================================

async function main() {
  checkBank()
  checkLogic()

  const A = await makeUser('a', 'Ayu')
  const B = await makeUser('b', 'Bima')
  const C = await makeUser('c', 'Citra')
  const D = await makeUser('d', 'Dodi')
  const G = await makeUser('g', 'Gita')
  const H = await makeUser('h', 'Hari')
  const E = await makeUser('e', 'Eka')
  const F = await makeUser('f', 'Fajar')
  const anon = anonClient()
  const cid = await pair(A, B)
  const cid2 = await pair(C, D)
  const cid3 = await pair(G, H)
  const cF = await F.client.rpc('create_couple')
  if (cF.error) throw new Error(`create_couple F: ${cF.error.message}`)
  couples.add(cF.data.id)

  // ---------- publication, grants ----------
  const pub = psql("select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'samakan%';")
  ok('realtime publication has samakan_sets and samakan_live_invites only', pub === 'samakan_live_invites,samakan_sets', pub)
  for (const fn of ['samakan_insert_set', 'samakan_history', 'samakan_claim_push', 'samakan_claim_readout', 'samakan_save_readout']) {
    const args = {
      samakan_insert_set: { p_couple: cid, p_creator: A.id, p_source: 'bank', p_theme: 'food', p_reason: null, p_rounds: bankSet('food', 1) },
      samakan_history: { p_couple: cid },
      samakan_claim_push: { p_set_id: cid, p_recipient: A.id, p_kind: 'start' },
      samakan_claim_readout: { p_set_id: cid },
      samakan_save_readout: { p_set_id: cid, p_readout: {} },
    }[fn]
    const r = await A.client.rpc(fn, args)
    ok(`partner cannot call server-only ${fn}`, denied(r), describe(r))
  }
  for (const fn of ['samakan_score', 'samakan_stats', 'samakan_expire_stale', 'samakan_personal_used_today', 'samakan_finish_if_complete']) {
    const args = {
      samakan_score: { p_kind: 'match', p_a_pick: 0, p_a_guess: null, p_b_pick: 0, p_b_guess: null },
      samakan_stats: { p_couple: cid },
      samakan_expire_stale: { p_couple: cid },
      samakan_personal_used_today: { p_couple: cid },
      samakan_finish_if_complete: { p_set_id: cid, p_actor: A.id },
    }[fn]
    ok(`helper ${fn} is not callable by clients`, denied(await A.client.rpc(fn, args)))
  }
  for (const [label, r] of [['hub', await hub({ client: anon })], ['set_state', await state({ client: anon }, cid)],
    ['answer', await answer({ client: anon }, cid, 0)], ['live_invite', await invite({ client: anon }, cid)]]) {
    ok(`anon cannot call ${label}`, !!r.error, describe(r))
  }
  const { count: noneYet } = await admin.from('samakan_sets').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  ok('no client call above created a set', noneYet === 0, String(noneYet))

  // ---------- personal switch: default on ----------
  const h0 = L.parseHub((await hub(A)).data)
  ok('hub: fresh couple has personal rounds on, nothing used today', h0.coupleId === cid && h0.hasPartner && h0.partnerId === B.id && h0.personal.enabled && !h0.personal.usedToday && !h0.openSet && h0.legacyCount === 0, JSON.stringify(h0).slice(0, 200))
  ok('couples.samakan_personal defaults to true', (await admin.from('couples').select('samakan_personal').eq('id', cid).single()).data?.samakan_personal === true)
  const eHub = L.parseHub((await hub(E)).data)
  ok('hub: no couple reads as no partner', eHub.coupleId === null && !eHub.hasPartner && eHub.sets.length === 0)
  const fHub = L.parseHub((await hub(F)).data)
  ok('hub: waiting for a partner reads as no partner', fHub.coupleId === cF.data.id && !fHub.hasPartner)

  // ---------- insert validation (couple 2 has no open set) ----------
  const good = bankSet('home', 11)
  const swap = (arr, i, j) => { const c = structuredClone(arr); [c[i], c[j]] = [c[j], c[i]]; return c }
  const edit = (i, patch) => { const c = structuredClone(good); c[i] = { ...c[i], ...patch }; return c }
  const bad = [
    ['6 rounds', 'bank', 'home', null, good.slice(0, 6)],
    ['8 rounds', 'bank', 'home', null, [...good, good[0]]],
    ['not an array', 'bank', 'home', null, { rounds: good }],
    ['kinds out of order', 'bank', 'home', null, swap(good, 0, 1)],
    ['match with 3 options', 'bank', 'home', null, edit(0, { options: ['a', 'b', 'c'] })],
    ['guess with repeated options', 'bank', 'home', null, edit(1, { options: ['Same', 'same ', 'x', 'y'] })],
    ['an option over 32 characters', 'bank', 'home', null, edit(1, { options: ['x'.repeat(33), 'b', 'c', 'd'] })],
    ['a number as an option', 'bank', 'home', null, edit(0, { options: ['a', 7] })],
    ['a 7-character prompt', 'bank', 'home', null, edit(0, { prompt: 'Too sho' })],
    ['a 141-character prompt', 'bank', 'home', null, edit(0, { prompt: 'p'.repeat(141) })],
    ['scale without labels', 'bank', 'home', null, edit(2, { low: null })],
    ['scale with equal labels', 'bank', 'home', null, edit(2, { low: 'Same', high: 'same' })],
    ['a 121-character talk line', 'bank', 'home', null, edit(0, { talk: 't'.repeat(121) })],
    ['an em dash', 'bank', 'home', null, edit(3, { prompt: 'Coffee or tea — pick one?' })],
    ['a bank round marked personal', 'bank', 'home', null, edit(0, { source: 'daily' })],
    ['ai source on a bank theme', 'ai', 'food', null, good],
    ['bank source on the personal theme', 'bank', 'personal', null, good],
    ['an ai set with a fallback reason', 'ai', 'personal', 'timeout', good],
    ['an unknown fallback reason', 'bank', 'mixed', 'because', good],
    ['an unknown theme', 'bank', 'sports', null, good],
  ]
  for (const [label, source, theme, reason, rounds] of bad) expectHint(`insert rejects ${label}`, await insertSet(admin, cid2, C.id, source, theme, reason, rounds), 'SK_INVALID')
  const { count: c2Sets } = await admin.from('samakan_sets').select('*', { count: 'exact', head: true }).eq('couple_id', cid2)
  ok('no invalid set was stored', c2Sets === 0, String(c2Sets))
  expectHint('insert refuses a creator from another couple', await insertSet(admin, cid2, A.id, 'bank', 'home', null, good), 'SK_NOT_FOUND')
  expectHint('insert refuses a couple waiting for a partner', await insertSet(admin, cF.data.id, F.id, 'bank', 'home', null, good), 'SK_NO_PARTNER')

  // ---------- gate 1: one set, 7 rounds, same on both phones ----------
  const heardAnswers = []
  const heardSets = []
  const heardInvites = []
  await listen(B.client, 'samakan_answers', null, heardAnswers)
  await listen(B.client, 'samakan_sets', `couple_id=eq.${cid}`, heardSets)
  await listen(B.client, 'samakan_live_invites', `couple_id=eq.${cid}`, heardInvites, 'INSERT')

  const d1 = bankSet('food', 21)
  const s1r = await insertSet(admin, cid, A.id, 'bank', 'food', null, d1)
  ok('insert a bank set: new id', !s1r.error && s1r.data?.existing === false && /^[0-9a-f-]{36}$/.test(s1r.data?.id ?? ''), describe(s1r))
  const S1 = s1r.data.id
  const r1 = await roundRows(S1)
  ok('gate 1: exactly 7 rounds in the order match, guess, scale, guess, match, scale, guess', r1.length === 7 && r1.map((r) => r.kind).join() === L.KIND_ORDER.join())
  ok('gate 1: stored prompts and option order are exactly what the server dealt', r1.every((r, i) => r.prompt === d1[i].prompt && JSON.stringify(r.options) === JSON.stringify(d1[i].options) && r.bank_id === d1[i].bank_id))
  const aS = L.parseSetState((await state(A, S1)).data)
  const bS = L.parseSetState((await state(B, S1)).data)
  const shape = (st) => JSON.stringify(st.rounds.map((r) => [r.id, r.position, r.kind, r.prompt, r.options, r.low, r.high, r.talk]))
  ok('gate 1: both partners get identical round ids, prompts and option order', shape(aS) === shape(bS) && aS.rounds.length === 7)
  const { data: startAct } = await admin.from('activities').select('kind, summary, actor_id, url').eq('ref_id', S1)
  ok('create writes one activity row', startAct?.length === 1 && startAct[0].summary === 'started a Samakan set' && startAct[0].actor_id === A.id && startAct[0].url === `/app/games/samakan/set/${S1}`, JSON.stringify(startAct))

  // ---------- gate 2: a second create returns the open set ----------
  const again = await insertSet(admin, cid, B.id, 'bank', 'travel', null, bankSet('travel', 2))
  ok('gate 2: second create (the partner) returns the open set, existing', again.data?.id === S1 && again.data?.existing === true, describe(again))
  const againAi = await insertSet(admin, cid, A.id, 'ai', 'personal', null, bankSet('plans', 3))
  ok('gate 2: even a personal create returns the open set first', againAi.data?.id === S1 && againAi.data?.existing === true, describe(againAi))
  const { count: c1Sets } = await admin.from('samakan_sets').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  const { count: c1Rounds } = await admin.from('samakan_rounds').select('*', { count: 'exact', head: true }).eq('couple_id', cid)
  ok('gate 2: nothing else was inserted', c1Sets === 1 && c1Rounds === 7, `${c1Sets} sets, ${c1Rounds} rounds`)
  const [race1, race2] = await Promise.all([
    insertSet(admin, cid3, G.id, 'bank', 'plans', null, bankSet('plans', 5)),
    insertSet(admin, cid3, H.id, 'bank', 'habits', null, bankSet('habits', 6)),
  ])
  const { count: c3Sets } = await admin.from('samakan_sets').select('*', { count: 'exact', head: true }).eq('couple_id', cid3)
  ok('gate 2: two creates at once make one set', c3Sets === 1 && race1.data?.id === race2.data?.id && [race1, race2].filter((r) => r.data?.existing === false).length === 1, `${describe(race1)} | ${describe(race2)}`)
  const P1 = race1.data.id

  // ---------- gate 3: answers are hidden ----------
  const [m0, g1, s2, g3, m4, s5, g6] = r1.map((r) => r.id)
  const a1 = await answer(A, g1, 2, 1)
  let a1p = null
  try { a1p = L.parseAnswerResult(a1.data) } catch { /* reported below */ }
  ok('first answer: stored, not revealed, no partner value', !a1.error && a1p?.revealed === false && a1p?.partner === null && a1p?.changed === false, describe(a1))
  const bRaw = (await state(B, S1)).data
  const bRound = L.parseSetState(bRaw).rounds.find((r) => r.id === g1)
  ok('gate 3: partner sees that A answered, not what', bRound?.partnerAnswered === true && bRound.partner === null && bRound.mine === null && bRound.revealed === false)
  ok('gate 3: the partner\'s whole set_state carries no pick or guess value', !/"(pick|guess)":/.test(JSON.stringify(bRaw)), JSON.stringify(bRaw).slice(0, 120))
  ok('gate 3: progress counts only', L.parseSetState(bRaw).set.progress.partner === 1 && L.parseSetState(bRaw).set.progress.me === 0)
  ok('gate 3: the partner\'s hub carries no pick or guess value', !/"(pick|guess)":/.test(JSON.stringify((await hub(B)).data)))
  for (const [who, u] of [['A', A], ['B', B], ['outsider C', C], ['no-couple E', E], ['anon', { client: anon }]]) {
    const sel = await u.client.from('samakan_answers').select('*')
    ok(`gate 3: ${who} cannot select samakan_answers`, denied(sel) || noRows(sel), describe(sel))
    if (who !== 'anon') ok(`gate 3: ${who} is denied outright (no grant)`, denied(sel), describe(sel))
  }
  const ins = await B.client.from('samakan_answers').insert({ round_id: g1, set_id: S1, profile_id: B.id, pick: 0, guess: 0 })
  ok('gate 3: direct insert into samakan_answers denied', denied(ins), describe(ins))
  const upd = await A.client.from('samakan_answers').update({ pick: 0 }).eq('round_id', g1).select()
  ok('gate 3: direct update of samakan_answers denied', denied(upd) || noRows(upd), describe(upd))
  const del = await A.client.from('samakan_answers').delete().eq('round_id', g1).select()
  ok('gate 3: direct delete of samakan_answers denied', denied(del) || noRows(del), describe(del))
  for (const [label, q] of [
    ['rounds embed', B.client.from('samakan_rounds').select('id, samakan_answers(pick, guess)').eq('set_id', S1)],
    ['sets embed', B.client.from('samakan_sets').select('id, samakan_answers(pick, guess)').eq('id', S1)],
    ['couples embed', B.client.from('couples').select('id, samakan_sets(id, samakan_rounds(id, samakan_answers(pick)))').eq('id', cid)],
  ]) {
    const r = await q
    ok(`gate 3: ${label} leaks no answer`, !!r.error || !/"pick":/.test(JSON.stringify(r.data ?? [])), describe(r))
  }
  const bRounds = await B.client.from('samakan_rounds').select('*').eq('set_id', S1)
  ok('gate 3: a member reads rounds, which hold no answer columns', !bRounds.error && bRounds.data?.length === 7 && bRounds.data.every((r) => !('pick' in r) && !('guess' in r) && r.score === null), describe(bRounds))
  const pushRead = await A.client.from('samakan_push_log').select('*')
  ok('push log is server only', denied(pushRead), describe(pushRead))
  for (const [label, r] of [
    ['insert a set', await A.client.from('samakan_sets').insert({ couple_id: cid, source: 'bank', theme: 'food' })],
    ['insert a round', await A.client.from('samakan_rounds').insert({ set_id: S1, couple_id: cid, position: 0, kind: 'match', prompt: 'Injected round?', options: ['a', 'b'] })],
    ['insert an invite', await A.client.from('samakan_live_invites').insert({ couple_id: cid, set_id: S1, created_by: A.id, recipient_id: B.id })],
  ]) ok(`clients cannot ${label} directly`, denied(r), describe(r))
  const fake = await A.client.from('samakan_sets').update({ matches: 12, max_matches: 12 }).eq('id', S1).select()
  ok('clients cannot fake a score on the set row', denied(fake) || noRows(fake), describe(fake))
  for (const [label, r] of [['set_state', await state(C, S1)], ['answer', await answer(C, g1, 0, 0)], ['skip', await skip(C, g3)],
    ['end', await endSet(C, S1)], ['live invite', await invite(C, S1)], ['set_state (no couple)', await state(E, S1)]]) {
    expectHint(`outsider: ${label} says not found`, r, 'SK_NOT_FOUND')
  }
  ok('outsider calls changed nothing', (await setRow(S1))?.status === 'open' && (await setRow(S1))?.version === 1)

  // ---------- gate 4: input validation per kind ----------
  const invalid = [
    ['match pick 2', m0, 2, null], ['match pick -1', m0, -1, null], ['match pick missing', m0, null, null], ['match with a guess', m0, 0, 1],
    ['guess pick 4', g3, 4, 0], ['guess without a guess', g3, 1, null], ['guess guess 4', g3, 1, 4], ['guess pick missing', g3, null, 1],
    ['scale pick 0', s2, 0, 3], ['scale pick 6', s2, 6, 3], ['scale without a guess', s2, 3, null], ['scale guess 0', s2, 3, 0], ['scale guess 6', s2, 3, 6],
  ]
  for (const [label, rid, p, gs] of invalid) expectHint(`gate 4: rejects ${label}`, await answer(B, rid, p, gs), 'SK_INVALID')
  const { count: bAnswers } = await admin.from('samakan_answers').select('*', { count: 'exact', head: true }).eq('set_id', S1).eq('profile_id', B.id)
  ok('gate 4: no invalid answer was stored', bAnswers === 0, String(bAnswers))

  // ---------- gate 5: change until the partner answers, then locked ----------
  const v0 = (await setRow(S1)).version
  const ch = await answer(A, g1, 3, 0)
  ok('gate 5: A changes the answer before B answers', !ch.error && ch.data?.changed === true && ch.data?.revealed === false, describe(ch))
  ok('gate 11: a change bumps version too', ch.data?.version === v0 + 1, `${v0} -> ${ch.data?.version}`)
  const b1 = await answer(B, g1, 3, 3)
  const exp1 = L.scoreRound('guess', { pick: 3, guess: 0 }, { pick: 3, guess: 3 })
  ok('gate 5: B answers second and sees A\'s changed answer', !b1.error && b1.data?.revealed === true && b1.data?.partner?.pick === 3 && b1.data?.partner?.guess === 0, describe(b1))
  ok('gate 7: guess scored once from both answers', b1.data?.score === exp1.score && b1.data?.learned === exp1.learned && b1.data?.matches === 1 && b1.data?.max_matches === 2, describe(b1))
  expectHint('gate 5: A can no longer change it', await answer(A, g1, 0, 0), 'SK_LOCKED')
  expectHint('gate 5: B can no longer change it', await answer(B, g1, 0, 0), 'SK_LOCKED')
  const aG1 = L.parseSetState((await state(A, S1)).data).rounds.find((r) => r.id === g1)
  ok('gate 5: A now sees B\'s answer and the score', aG1?.revealed && aG1.partner?.pick === 3 && aG1.partner?.guess === 3 && aG1.mine?.pick === 3 && aG1.score === exp1.score)

  // ---------- gate 6: two answers at the same moment ----------
  const [x0, y0] = await Promise.all([answer(A, m0, 0), answer(B, m0, 0)])
  ok('gate 6: both simultaneous answers store', !x0.error && !y0.error, `${describe(x0)} | ${describe(y0)}`)
  ok('gate 6: exactly one of them opens the reveal', [x0, y0].filter((r) => r.data?.revealed).length === 1)
  const m0Row = (await roundRows(S1))[0]
  ok('gate 6: the round is scored once', m0Row.score === 1 && !!m0Row.revealed_at && (await setRow(S1)).matches === 2, JSON.stringify({ score: m0Row.score, matches: (await setRow(S1)).matches }))
  await answer(A, s2, 4, 2)
  const bs2 = await answer(B, s2, 3, 4)
  ok('gate 7: scale close guess scores 0 and is not new, exact guess scores 1', bs2.data?.score === 1 && bs2.data?.learned === 0, describe(bs2))
  const plan = {
    [g3]: [[1, 1], [1, 1]], [m4]: [[1, null], [0, null]], [s5]: [[1, 5], [5, 1]], [g6]: [[0, 2], [3, 1]],
  }
  const parallel = await Promise.all([g3, m4, s5].flatMap((rid) => [answer(A, rid, ...plan[rid][0]), answer(B, rid, ...plan[rid][1])]))
  ok('gate 6: six answers across three rounds in parallel all store', parallel.every((r) => !r.error), parallel.map(describe).filter((x) => !x.startsWith('data')).join(' | '))
  ok('gate 6: three reveals, one per round', parallel.filter((r) => r.data?.revealed).length === 3)
  ok('gate 8: still open with one round left', (await setRow(S1)).status === 'open' && parallel.every((r) => r.data?.done === false))
  const lastA = await answer(A, g6, ...plan[g6][0])
  ok('gate 8: not done after only one partner answers the last round', lastA.data?.done === false && (await setRow(S1)).status === 'open')
  const lastB = await answer(B, g6, ...plan[g6][1])
  ok('gate 8: done exactly when the last round is revealed', lastB.data?.done === true && lastB.data?.revealed === true, describe(lastB))
  const expected = [
    L.scoreRound('match', { pick: 0, guess: null }, { pick: 0, guess: null }),
    exp1,
    L.scoreRound('scale', { pick: 4, guess: 2 }, { pick: 3, guess: 4 }),
    ...[g3, m4, s5, g6].map((rid, i) => L.scoreRound(['guess', 'match', 'scale', 'guess'][i], { pick: plan[rid][0][0], guess: plan[rid][0][1] }, { pick: plan[rid][1][0], guess: plan[rid][1][1] })),
  ]
  const want = expected.reduce((t, x) => ({ score: t.score + x.score, learned: t.learned + x.learned, max: t.max + x.max }), { score: 0, learned: 0, max: 0 })
  const s1Done = await setRow(S1)
  ok('gate 6/7: matches equal a sequential run of the same answers', s1Done.matches === want.score && s1Done.learned === want.learned && want.score === 7 && want.learned === 3, JSON.stringify({ db: [s1Done.matches, s1Done.learned], want }))
  ok('gate 7: max is 12 with no skips', s1Done.max_matches === 12 && want.max === 12 && s1Done.revealed === 7)
  ok('gate 8: stores matches, max and finished_at, finished_by is the last answerer', s1Done.status === 'done' && !!s1Done.finished_at && s1Done.finished_by === B.id)
  ok('gate 11: every one of the 15 answer writes bumped version once', s1Done.version === 15, String(s1Done.version))
  const { data: s1Acts } = await admin.from('activities').select('summary, actor_id').eq('ref_id', S1).order('created_at')
  ok('gate 8: one finish activity, score only, no answer text', s1Acts?.length === 2 && s1Acts[1].summary === `finished a Samakan set: ${want.score} of 12 matches` && s1Acts[1].actor_id === B.id, JSON.stringify(s1Acts))
  const fullA = L.parseSetState((await state(A, S1)).data)
  ok('scoreSet on the client agrees with the server', JSON.stringify(L.scoreSet(fullA.rounds)) === JSON.stringify({ matches: 7, max: 12, learned: 3, revealed: 7 }))
  ok('results: every round has both picks and guesses for both partners', fullA.rounds.every((r) => r.revealed && r.mine && r.partner && r.score !== null))
  expectHint('a done set takes no more answers', await answer(A, g6, 1, 1), 'SK_ENDED')
  expectHint('a done set cannot be ended', await endSet(A, S1), 'SK_ENDED')
  expectHint('a done set takes no live invite', await invite(A, S1), 'SK_ENDED')

  // ---------- gate 11: realtime ----------
  await sleep(1500)
  ok('gate 11: realtime on samakan_answers delivers nothing', heardAnswers.length === 0, `${heardAnswers.length} events`)
  ok('gate 11: the partner hears set updates live', heardSets.length >= 5, `${heardSets.length} events`)
  ok('gate 11: no set payload carries an answer value', heardSets.every((p) => !/"(pick|guess)":/.test(JSON.stringify(p.new ?? {})) && Object.values(p.new?.progress ?? {}).every((n) => typeof n === 'number')))

  // ---------- read-out (one per finished set) ----------
  ok('read-out: an open set cannot be claimed', (await admin.rpc('samakan_claim_readout', { p_set_id: P1 })).data === false)
  ok('read-out: first claim wins', (await admin.rpc('samakan_claim_readout', { p_set_id: S1 })).data === true)
  ok('read-out: a fresh claim cannot be taken twice', (await admin.rpc('samakan_claim_readout', { p_set_id: S1 })).data === false)
  const tpl = L.templateReadout(fullA.rounds)
  for (const [label, ro] of [
    ['a percent sign', { ...tpl, note: '58% in sync' }], ['a 221-character note', { ...tpl, note: 'n'.repeat(221) }],
    ['an em dash', { ...tpl, ask: 'Who knew — right?' }], ['no ask', { headline: tpl.headline, note: tpl.note, by: 'template' }], ['an unknown author', { ...tpl, by: 'robot' }],
  ]) expectHint(`read-out rejects ${label}`, await admin.rpc('samakan_save_readout', { p_set_id: S1, p_readout: ro }), 'SK_INVALID')
  const saved = await admin.rpc('samakan_save_readout', { p_set_id: S1, p_readout: tpl })
  ok('read-out: the template read-out saves', saved.data === true, describe(saved))
  ok('read-out: at most one per set', (await admin.rpc('samakan_save_readout', { p_set_id: S1, p_readout: { ...tpl, headline: 'Second' } })).data === false)
  const afterRo = L.parseSetState((await state(B, S1)).data).set
  ok('read-out: both see it, version bumped', afterRo.readout?.headline === tpl.headline && afterRo.readoutStatus === 'done' && afterRo.version === 16)

  // ---------- personal switch off blocks AI sets ----------
  ok('switch: A turns personal rounds off', (await setPersonal(A, false)).data === false)
  ok('switch: B sees it off', L.parseHub((await hub(B)).data).personal.enabled === false)
  await setPersonal(A, false)
  const { data: swActs } = await admin.from('activities').select('summary, actor_id').eq('couple_id', cid).eq('kind', 'samakan').like('summary', 'turned%')
  ok('switch: one activity tells the partner, repeating changes nothing', swActs?.length === 1 && swActs[0].summary === 'turned off personal rounds in Samakan' && swActs[0].actor_id === A.id, JSON.stringify(swActs))
  expectHint('switch off: an AI set is refused', await insertSet(admin, cid, A.id, 'ai', 'personal', null, bankSet('plans', 8)), 'SK_PERSONAL_OFF')
  expectHint('switch: on or off is required', await setPersonal(A, null), 'SK_INVALID')
  expectHint('switch: needs a couple', await setPersonal(E, false), 'SK_NO_PARTNER')
  await setPersonal(C, false)
  ok('switch: another couple flips only its own switch', (await admin.from('couples').select('samakan_personal').eq('id', cid2).single()).data.samakan_personal === false
    && L.parseHub((await hub(A)).data).personal.enabled === false)
  await setPersonal(C, true)
  const direct = await A.client.from('couples').update({ samakan_personal: true }).eq('id', cid).select()
  ok('switch: no direct write to couples', denied(direct) || noRows(direct), describe(direct))
  ok('switch: still off after the direct write', (await admin.from('couples').select('samakan_personal').eq('id', cid).single()).data.samakan_personal === false)

  // ---------- gate 9: skips (set 2, done by a skip) ----------
  const S2 = await newSet(cid, B.id, 'weekends', 31)
  const [w0, w1, w2, w3, w4, w5, w6] = S2.rounds.map((r) => r.id)
  const sk1 = await skip(B, w2)
  ok('gate 9: B skips a round nobody answered', !sk1.error && sk1.data?.skipped === true && sk1.data?.done === false, describe(sk1))
  const aSeesSkip = L.parseSetState((await state(A, S2.id)).data).rounds.find((r) => r.id === w2)
  ok('gate 9: A sees "skipped by B"', aSeesSkip?.skipped && aSeesSkip.skippedBy === B.id && L.parseSetState((await state(A, S2.id)).data).set.total === 6)
  expectHint('gate 9: a skipped round takes no answer', await answer(A, w2, 3, 3), 'SK_SKIPPED')
  expectHint('gate 9: a skipped round cannot be skipped again', await skip(A, w2), 'SK_SKIPPED')
  await answer(A, w1, 0, 1)
  expectHint('gate 9: no skip once A answered (for B)', await skip(B, w1), 'SK_ANSWERED')
  expectHint('gate 9: no skip once A answered (for A)', await skip(A, w1), 'SK_ANSWERED')
  await answer(B, w1, 1, 0)
  for (const [rid, a, b] of [[w0, [1, null], [1, null]], [w3, [2, 2], [2, 3]], [w4, [0, null], [1, null]], [w5, [2, 4], [4, 2]]]) {
    await answer(A, rid, ...a)
    await answer(B, rid, ...b)
  }
  ok('gate 9: still open with one round untouched', (await setRow(S2.id)).status === 'open')
  const sk2 = await skip(A, w6)
  ok('gate 9: skipping the last open round finishes the set', !sk2.error && sk2.data?.done === true, describe(sk2))
  const s2Row = await setRow(S2.id)
  ok('gate 7: each skip drops its own max (12 - 2 - 2 = 8)', s2Row.status === 'done' && s2Row.max_matches === 8 && s2Row.skips === 2 && s2Row.revealed === 5, JSON.stringify({ max: s2Row.max_matches, skips: s2Row.skips, revealed: s2Row.revealed }))
  ok('gate 7: skipped rounds score nothing', s2Row.matches === L.scoreSet(L.parseSetState((await state(A, S2.id)).data).rounds).matches)

  // ---------- set 3: live invites, skip limit, races, end ----------
  const S3 = await newSet(cid, A.id, 'home', 41)
  const [h0r, h1r, h2r, h3r, , h5r, h6r] = S3.rounds.map((r) => r.id)
  const [rs, ra] = await Promise.all([skip(A, h0r), answer(B, h0r, 1)])
  const skipWon = !rs.error && ra.error?.hint === 'SK_SKIPPED'
  const answerWon = !ra.error && rs.error?.hint === 'SK_ANSWERED'
  ok('race: a skip and an answer on one round, exactly one wins', skipWon !== answerWon, `${describe(rs)} | ${describe(ra)}`)
  for (const rid of [h2r, h5r]) if ((await setRow(S3.id)).skips < 2) await skip(B, rid)
  expectHint('gate 9: a third skip in a set is refused', await skip(A, h6r), 'SK_SKIP_LIMIT')
  ok('gate 9: two skips at most', (await setRow(S3.id)).skips === 2)

  const i1 = await invite(A, S3.id)
  let i1p = null
  try { i1p = L.parseLiveInviteResult(i1.data) } catch { /* reported below */ }
  ok('live: A asks B to play now', !i1.error && i1p?.created === true && i1p.invite.recipientId === B.id && i1p.invite.createdBy === A.id, describe(i1))
  const liveMs = new Date(i1p?.invite.expiresAt).getTime() - new Date(i1p?.invite.createdAt).getTime()
  ok('live: the invite lives 10 minutes', Math.abs(liveMs - L.LIVE_INVITE_MINUTES * 60_000) < 2000, String(liveMs))
  const i1again = await invite(A, S3.id)
  ok('live: asking again returns the same invite, no new push', i1again.data?.created === false && i1again.data?.invite?.id === i1p?.invite.id, describe(i1again))
  const bInv = await B.client.from('samakan_live_invites').select('*')
  const cInv = await C.client.from('samakan_live_invites').select('*')
  ok('live: B (recipient) can read it, the other couple cannot', bInv.data?.length === 1 && bInv.data[0].id === i1p?.invite.id && (cInv.data ?? []).length === 0, `${describe(bInv)} | ${describe(cInv)}`)
  const hubLive = L.parseHub((await hub(B)).data).openSet?.liveInvite
  ok('live: the hub and the set show the invite', hubLive?.id === i1p?.invite.id && L.inviteIsLive(hubLive) && L.parseSetState((await state(B, S3.id)).data).set.liveInvite?.id === i1p?.invite.id)
  expectHint('live: only the recipient can accept', await accept(A, i1p.invite.id), 'SK_NOT_FOUND')
  expectHint('live: the other couple cannot accept', await accept(C, i1p.invite.id), 'SK_NOT_FOUND')
  const acc = await accept(B, i1p.invite.id)
  ok('live: B accepts', !acc.error && !!L.parseLiveInvite(acc.data)?.acceptedAt, describe(acc))
  const expireInvites = () => admin.from('samakan_live_invites')
    .update({ created_at: new Date(Date.now() - 30 * 60_000).toISOString(), expires_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq('set_id', S3.id)
  await expireInvites()
  const i2 = await invite(A, S3.id)
  ok('live: once it runs out, a new one can go (2 of 3 today)', i2.data?.created === true, describe(i2))
  const joined = await invite(B, S3.id)
  ok('live: B asking while A\'s invite is live joins it instead (no ping-pong push)', joined.data?.joined === true && joined.data?.created === false && joined.data?.invite?.id === i2.data?.invite?.id && !!joined.data?.invite?.accepted_at, describe(joined))
  await expireInvites()
  const i3 = await invite(A, S3.id)
  ok('live: third invite today', i3.data?.created === true, describe(i3))
  await expireInvites()
  expectHint('live: a fourth invite in one Jakarta day is refused', await invite(A, S3.id), 'SK_LIMIT')
  expectHint('live: accepting a run-out invite says so', await accept(B, i3.data?.invite?.id), 'SK_EXPIRED')
  await sleep(1000)
  ok('live: B hears new invites over realtime', heardInvites.length >= 3 && heardInvites.every((p) => p.new?.recipient_id === B.id || p.new?.created_by === B.id), `${heardInvites.length} events`)

  // one-sided answers then end
  await answer(A, h1r, 0, 0)
  await answer(A, h3r, 1, 2)
  await answer(B, h3r, 2, 1)
  const ended = await endSet(B, S3.id)
  ok('end: B ends the set for both', !ended.error && ended.data?.status === 'ended', describe(ended))
  const s3Row = await setRow(S3.id)
  ok('end: stored with who and when', s3Row.status === 'ended' && s3Row.ended_by === B.id && !!s3Row.ended_at && !s3Row.finished_at)
  const { data: endAct } = await admin.from('activities').select('summary').eq('ref_id', S3.id).eq('summary', 'ended a Samakan set')
  ok('end: writes one activity', endAct?.length === 1)
  const aEnded = L.parseSetState((await state(A, S3.id)).data)
  const aEndedRaw = JSON.stringify((await state(A, S3.id)).data)
  ok('gate 10: after the end, rounds both answered stay visible', aEnded.rounds.find((r) => r.id === h3r)?.partner?.pick === 2 && aEnded.rounds.find((r) => r.id === h3r)?.mine?.pick === 1)
  ok('gate 10: a one-sided answer is never returned, not even to its author', aEnded.rounds.find((r) => r.id === h1r)?.mine === null && aEnded.rounds.find((r) => r.id === h1r)?.partner === null)
  ok('gate 10: picks appear only for revealed rounds', (aEndedRaw.match(/"pick":/g) ?? []).length === aEnded.rounds.filter((r) => r.revealed).length * 2, aEndedRaw.slice(0, 120))
  expectHint('end: an ended set takes no answers', await answer(B, h1r, 0, 0), 'SK_ENDED')
  expectHint('end: an ended set takes no skips', await skip(A, h6r), 'SK_ENDED')
  expectHint('end: ending twice says ended', await endSet(A, S3.id), 'SK_ENDED')

  // ---------- gate 10: expiry after 7 days, lazily ----------
  const S4 = await newSet(cid, A.id, 'travel', 51)
  await answer(A, S4.rounds[0].id, 1)
  await answer(B, S4.rounds[0].id, 1)
  await answer(A, S4.rounds[1].id, 2, 2)
  await admin.from('samakan_sets').update({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq('id', S4.id)
  expectHint('gate 10: an 8-day-old set takes no answers', await answer(B, S4.rounds[1].id, 2, 2), 'SK_ENDED')
  expectHint('gate 10: an 8-day-old set takes no live invite', await invite(B, S4.id), 'SK_ENDED')
  const hAfter = L.parseHub((await hub(B)).data)
  const s4Row = await setRow(S4.id)
  ok('gate 10: the next hub load expires it', s4Row.status === 'expired' && !!s4Row.ended_at && hAfter.openSet === null && hAfter.sets.some((s) => s.id === S4.id && s.status === 'expired'), JSON.stringify({ status: s4Row.status }))
  const aExp = L.parseSetState((await state(A, S4.id)).data)
  ok('gate 10: the expired set keeps the round both answered and hides the one-sided one', aExp.rounds[0].revealed && aExp.rounds[0].partner?.pick === 1 && aExp.rounds[1].mine === null && aExp.rounds[1].partner === null)
  const S5 = await newSet(cid, B.id, 'habits', 61)
  await admin.from('samakan_sets').update({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq('id', S5.id)

  // ---------- personal set: once per Jakarta day ----------
  await setPersonal(B, true)
  const personal = bankSet('plans', 71).map((d, i) => ({ ...d, bank_id: i === 3 ? d.bank_id : null, source: ['daily', 'moments', 'general', 'general', 'mood', 'general', 'bucket'][i] }))
  const ai = await insertSet(admin, cid, A.id, 'ai', 'personal', null, personal)
  ok('gate 10: a create expires the stale open set first', (await setRow(S5.id)).status === 'expired')
  ok('personal: an AI set goes in once the switch is on', !ai.error && ai.data?.existing === false, describe(ai))
  const aiRounds = await roundRows(ai.data.id)
  ok('personal: round sources are kept', aiRounds.map((r) => r.source).join() === 'daily,moments,general,general,mood,general,bucket')
  ok('personal: the hub marks today\'s personal set as used', L.parseHub((await hub(A)).data).personal.usedToday === true)
  await endSet(A, ai.data.id)
  expectHint('personal: a second AI set the same Jakarta day is refused', await insertSet(admin, cid, A.id, 'ai', 'personal', null, personal), 'SK_DAILY_LIMIT')
  const fb = await insertSet(admin, cid, A.id, 'bank', 'mixed', 'daily_limit', bankSet('mixed', 72))
  ok('personal: the bank fallback with daily_limit goes in', !fb.error && fb.data?.existing === false && (await setRow(fb.data.id)).fallback_reason === 'daily_limit', describe(fb))
  await endSet(B, fb.data.id)
  const pastIds = L.parseHub((await hub(A)).data).sets.map((s) => s.id)
  ok('hub: past sets list ended or expired sets only when something was revealed', [S1, S2.id, S3.id, S4.id].every((id) => pastIds.includes(id))
    && ![S5.id, ai.data.id, fb.data.id].some((id) => pastIds.includes(id)), JSON.stringify(pastIds))

  // ---------- history for the bank pick ----------
  const hist = L.parseHistory((await admin.rpc('samakan_history', { p_couple: cid })).data)
  const { data: allDealt } = await admin.from('samakan_rounds').select('bank_id').eq('couple_id', cid).not('bank_id', 'is', null)
  const dealt = new Set((allDealt ?? []).map((r) => r.bank_id))
  ok('history: every dealt bank round is listed once', hist.bank.length === dealt.size && dealt.size >= 30 && hist.bank.every((b) => dealt.has(b.bankId) && !!b.lastUsed)
    && new Set(hist.bank.map((b) => b.bankId)).size === hist.bank.length, `${hist.bank.length} vs ${dealt.size}`)
  ok('history: last 40 prompts, newest first', hist.prompts.length === 40 && hist.prompts[0] === (await roundRows(fb.data.id))[0].prompt)
  ok('history: skipped prompts are listed', hist.skipped.includes(S2.rounds[2].prompt) && hist.skipped.includes(S2.rounds[6].prompt))
  const nextFood = L.pickBankRounds({ bank: SAMAKAN_BANK, theme: 'food', history: L.historyMap(hist), random: seeded(81) })
  ok('history: the next food set repeats nothing from the last 60 days', nextFood.every((d) => !hist.bank.some((b) => b.bankId === d.bank_id)))

  // ---------- gate 25: legacy game_sessions ----------
  const legacyRounds = [
    { type: 'pilih_sama', roundIndex: 0, config: { type: 'pilih_sama', storyPrompt: 'Where to tomorrow?', options: ['Beach', 'Mountain'] }, hostAnswer: 0, guestAnswer: 0, score: 10 },
    { type: 'slider_sama', roundIndex: 1, config: { type: 'slider_sama', storyPrompt: '', question: 'How long can you walk?', minLabel: 'Not far', maxLabel: 'All day' }, hostAnswer: 7, guestAnswer: 4, score: 6 },
  ]
  const lastMonth = new Date(Date.now() - 40 * 86_400_000).toISOString()
  const nowIso = new Date().toISOString()
  // Same keys on every row: PostgREST fills a key missing from one row with null.
  const legacy = await admin.from('game_sessions').insert([
    { couple_id: cid, created_by: A.id, partner_id: B.id, chapter_id: 'hari-pertama', status: 'completed', rounds: legacyRounds, round_types: ['pilih_sama', 'slider_sama'], total_score: 16, created_at: nowIso, completed_at: nowIso },
    { couple_id: cid, created_by: B.id, partner_id: A.id, chapter_id: 'hari-pertama', status: 'completed', rounds: legacyRounds, round_types: ['pilih_sama'], total_score: 10, created_at: lastMonth, completed_at: lastMonth },
    { couple_id: cid2, created_by: C.id, partner_id: D.id, chapter_id: 'hari-pertama', status: 'waiting', rounds: [], round_types: ['pilih_sama'], total_score: 0, created_at: nowIso, completed_at: null },
    { couple_id: cid3, created_by: G.id, partner_id: H.id, chapter_id: 'hari-pertama', status: 'playing', rounds: [], round_types: ['pilih_sama'], total_score: 0, created_at: nowIso, completed_at: null },
  ]).select('id, status')
  ok('legacy fixture rows go in (service role)', !legacy.error && legacy.data?.length === 4, describe(legacy))
  psql(null, MIGRATION)
  psql("notify pgrst, 'reload schema';")
  await sleep(1200)
  ok('migration re-applies cleanly on a live database', true)
  ok('gate 25: no waiting or playing game_sessions remain', psql("select count(*) from public.game_sessions where status in ('waiting', 'playing');") === '0')
  const statuses = (await admin.from('game_sessions').select('status').in('id', legacy.data.map((r) => r.id))).data?.map((r) => r.status).sort().join()
  ok('gate 25: open lobbies expired, completed games untouched', statuses === 'completed,completed,expired,expired', statuses)
  const aLegacy = await A.client.from('game_sessions').select('id, status, rounds, chapter_id, total_score').eq('couple_id', cid).order('completed_at')
  ok('gate 25: completed games still open read-only, with questions and both answers', !aLegacy.error && aLegacy.data?.length === 2
    && aLegacy.data[1].rounds[1].config.question === 'How long can you walk?' && aLegacy.data[1].rounds[1].hostAnswer === 7 && aLegacy.data[1].rounds[1].guestAnswer === 4, describe(aLegacy))
  const cLegacy = await C.client.from('game_sessions').select('id').eq('couple_id', cid)
  ok('gate 25: another couple cannot read them', noRows(cLegacy), describe(cLegacy))
  const gIns = await A.client.from('game_sessions').insert({ couple_id: cid, created_by: A.id, partner_id: B.id, chapter_id: 'hari-pertama', round_types: ['a'], rounds: [] })
  ok('gate 25: authenticated can no longer insert into game_sessions', denied(gIns), describe(gIns))
  const gUpd = await A.client.from('game_sessions').update({ total_score: 99 }).eq('couple_id', cid).select()
  ok('gate 25: nor update', denied(gUpd) || noRows(gUpd), describe(gUpd))
  const gDel = await B.client.from('game_sessions').delete().eq('couple_id', cid).select()
  ok('gate 25: nor delete', denied(gDel) || noRows(gDel), describe(gDel))
  ok('gate 25: legacy rows unchanged by those attempts', (await admin.from('game_sessions').select('total_score').eq('couple_id', cid)).data?.map((r) => r.total_score).sort().join() === '10,16')
  const grants = psql("select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'game_sessions' and grantee = 'authenticated';")
  const pols = psql("select string_agg(polname || ':' || polcmd::text, ',') from pg_policy where polrelid = 'public.game_sessions'::regclass;")
  ok('gate 25: authenticated keeps SELECT only, through one select policy', grants === 'SELECT' && pols === 'game_sessions_member_select:r', `${grants} | ${pols}`)
  ok('gate 25: the hub counts older games', L.parseHub((await hub(B)).data).legacyCount === 2)
  ok('migration re-apply kept every samakan row', (await setRow(S1))?.readout_status === 'done' && (await roundRows(S1)).length === 7)

  // ---------- gate 26: monthly recap counts old and new ----------
  globalThis.__samakanRecapClient = A.client
  const monthKey = L.jakartaDate(new Date()).slice(0, 7)
  const recap = await loadRecap({ userId: A.id, coupleId: cid, partnerId: B.id, names: { [A.id]: 'Ayu', [B.id]: 'Bima' } }, monthKey)
  const { startTs, endTs } = monthRange(monthKey)
  const { count: doneThisMonth } = await admin.from('samakan_sets').select('*', { count: 'exact', head: true }).eq('couple_id', cid).eq('status', 'done').gte('finished_at', startTs).lt('finished_at', endTs)
  ok('gate 26: recap counts finished sets plus completed older games this month', doneThisMonth === 2 && recap.gamesCompleted === 3, `recap ${recap.gamesCompleted}, sets ${doneThisMonth}`)
  ok('gate 26: ended and expired sets and last month\'s game are left out', recap.gamesCompleted === doneThisMonth + 1 && /3 games of Samakan/.test(recap.headline), recap.headline)

  // ---------- gate 23: best, weeks in a row, sets played (fixture couple) ----------
  const DAY = 86_400_000
  const thisWeek = new Date(`${L.jakartaWeekStart(new Date())}T00:00:00+07:00`).getTime()
  const at = (ms) => new Date(ms).toISOString()
  const fixture = [
    { tag: 'd1', status: 'done', matches: 9, max: 12, revealed: 7, at: at(thisWeek - 7 * DAY + 3 * 3600_000) },      // last week, Monday 03:00 Jakarta (Sunday in UTC)
    { tag: 'd2', status: 'done', matches: 11, max: 12, revealed: 7, at: at(thisWeek - 14 * DAY + 30 * 60_000) },     // 2 weeks ago, Monday 00:30 Jakarta
    { tag: 'd3', status: 'done', matches: 11, max: 12, revealed: 7, at: at(thisWeek - 28 * DAY + 3600_000) },        // 4 weeks ago, same score, older
    { tag: 'e1', status: 'ended', matches: 4, max: 4, revealed: 4, at: at(thisWeek + 3600_000) },                    // this week, too few rounds for best
    { tag: 'e2', status: 'expired', matches: 6, max: 8, revealed: 5, at: at(thisWeek - 21 * DAY + 3600_000) },       // 3 weeks ago, not finished
  ]
  const ids = {}
  for (const f of fixture) {
    const { data, error } = await admin.from('samakan_sets').insert({
      couple_id: cid2, created_by: C.id, source: 'bank', theme: 'food', status: f.status, matches: f.matches, max_matches: f.max,
      revealed: f.revealed, created_at: at(new Date(f.at).getTime() - 3600_000),
      finished_at: f.status === 'done' ? f.at : null, ended_at: f.status === 'done' ? null : f.at,
    }).select('id').single()
    if (error) throw new Error(`fixture ${f.tag}: ${error.message}`)
    ids[f.tag] = data.id
  }
  const stats1 = L.parseHub((await hub(C)).data).stats
  const statSets = fixture.map((f) => ({ id: ids[f.tag], status: f.status, matches: f.matches, maxMatches: f.max, revealed: f.revealed, at: f.at }))
  const doneAts = fixture.filter((f) => f.status === 'done').map((f) => f.at)
  ok('gate 23: weeks in a row = 2 (this week empty, gap 3 weeks ago, Jakarta Monday edges)', stats1.streakWeeks === 2 && L.weeklyStreak(doneAts) === 2, JSON.stringify(stats1))
  ok('gate 23: best = 11 of 12, the later of the tie', stats1.best?.setId === ids.d2 && L.bestSet(statSets)?.id === ids.d2 && stats1.best.matches === 11)
  ok('gate 23: sets played counts finished sets only', stats1.setsPlayed === 3)
  ok('gate 23: last time = the most recent finished set', stats1.last?.setId === ids.d1 && stats1.last.matches === 9)
  const d4 = await admin.from('samakan_sets').insert({ couple_id: cid2, created_by: D.id, source: 'bank', theme: 'home', status: 'done', matches: 12, max_matches: 12, revealed: 7, finished_at: at(Date.now() - 60_000) }).select('id').single()
  const stats2 = L.parseHub((await hub(D)).data).stats
  ok('gate 23: a set this week extends the streak and takes best', stats2.streakWeeks === 3 && stats2.best?.setId === d4.data?.id && stats2.setsPlayed === 4 && L.weeklyStreak([...doneAts, at(Date.now() - 60_000)]) === 3, JSON.stringify(stats2))
  ok('gate 23: set_state flags the best set', L.parseSetState((await state(C, d4.data.id)).data).isBest === true && L.parseSetState((await state(C, ids.d1)).data).isBest === false)

  // ---------- push rules (couple 3) ----------
  const pr = async (setId, rid, kind) => (await claimPush(setId, rid, kind)).data
  ok('push: start never goes to the set\'s creator', (await pr(P1, (await setRow(P1)).created_by, 'start'))?.reason === 'self')
  const partnerOfCreator = (await setRow(P1)).created_by === G.id ? H : G
  const creator = partnerOfCreator === H ? G : H
  ok('push: start goes to the partner once', (await pr(P1, partnerOfCreator.id, 'start'))?.ok === true && (await pr(P1, partnerOfCreator.id, 'start'))?.reason === 'duplicate')
  ok('push: never to someone outside the couple', (await pr(P1, C.id, 'start'))?.reason === 'not_member' && (await pr(P1, C.id, 'bogus'))?.reason === 'invalid')
  ok('push: nudge waits 3 hours', (await pr(P1, partnerOfCreator.id, 'nudge'))?.reason === 'too_soon')
  await admin.from('samakan_sets').update({ created_at: new Date(Date.now() - 4 * 3600_000).toISOString() }).eq('id', P1)
  ok('push: one nudge after 3 hours', (await pr(P1, partnerOfCreator.id, 'nudge'))?.ok === true && (await pr(P1, partnerOfCreator.id, 'nudge'))?.reason === 'duplicate')
  ok('push: the hub shows the nudge was spent', L.parseHub((await hub(creator)).data).openSet?.nudged === true && L.nudgeOpensAt(L.parseHub((await hub(creator)).data).openSet) === null)
  ok('push: live needs a live invite', (await pr(P1, partnerOfCreator.id, 'live'))?.reason === 'no_invite')
  await invite(creator, P1)
  ok('push: a live invite pushes once', (await pr(P1, partnerOfCreator.id, 'live'))?.ok === true && (await pr(P1, partnerOfCreator.id, 'live'))?.reason === 'no_invite')
  await admin.from('samakan_live_invites').update({ created_at: new Date(Date.now() - 30 * 60_000).toISOString(), expires_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq('set_id', P1)
  await invite(creator, P1)
  ok('push: at most 3 Samakan pushes per recipient per Jakarta day', (await pr(P1, partnerOfCreator.id, 'live'))?.reason === 'daily_cap')
  const pRounds = await roundRows(P1)
  const pick = (k) => (k === 'scale' ? [3, 3] : k === 'match' ? [0, null] : [0, 0])
  for (const r of pRounds) await answer(creator, r.id, ...pick(r.kind))
  ok('push: no nudge to someone who already finished', (await pr(P1, creator.id, 'nudge'))?.reason === 'finished')
  ok('push: finish waits for a finished set', (await pr(P1, creator.id, 'finish'))?.reason === 'not_done')
  for (const r of pRounds) await answer(partnerOfCreator, r.id, ...pick(r.kind))
  ok('push: P1 is done, finished by the second partner', (await setRow(P1)).status === 'done' && (await setRow(P1)).finished_by === partnerOfCreator.id)
  ok('push: finish never goes to the one who just finished', (await pr(P1, partnerOfCreator.id, 'finish'))?.reason === 'self')
  ok('push: finish is held while the first finisher answered in the last 2 minutes', (await pr(P1, creator.id, 'finish'))?.reason === 'live')
  await admin.from('samakan_answers').update({ answered_at: new Date(Date.now() - 5 * 60_000).toISOString(), updated_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq('set_id', P1).eq('profile_id', creator.id)
  ok('push: finish goes to the first finisher once', (await pr(P1, creator.id, 'finish'))?.ok === true && (await pr(P1, creator.id, 'finish'))?.reason === 'duplicate')
  ok('push: start and nudge stop once the set is done', (await pr(P1, partnerOfCreator.id, 'nudge'))?.reason === 'not_open')
  const { data: log } = await admin.from('samakan_push_log').select('kind, recipient_id').eq('set_id', P1)
  ok('push: the log holds exactly the pushes that were allowed', log?.length === 4 && log.filter((l) => l.recipient_id === partnerOfCreator.id).length === 3, JSON.stringify(log))

  // ---------- every samakan activity is copy without answers ----------
  const { data: acts } = await admin.from('activities').select('summary').in('couple_id', [cid, cid2, cid3]).eq('kind', 'samakan')
  ok('activities carry no answer text', (acts ?? []).length > 0 && acts.every((a) => /^(started a Samakan set|ended a Samakan set|finished a Samakan set: \d+ of \d+ matches|turned (on|off) personal rounds in Samakan)$/.test(a.summary)), JSON.stringify(acts?.slice(0, 3)))

  // ---------- closed couple ----------
  const S8 = await newSet(cid, A.id, 'plans', 91)
  await answer(A, S8.rounds[0].id, 0)
  const left = await B.client.rpc('leave_couple')
  ok('B leaves (couple closes)', !left.error && left.data?.deleted === false, describe(left))
  expectHint('closed couple: no answers', await answer(A, S8.rounds[1].id, 1, 1), 'SK_CLOSED')
  expectHint('closed couple: no skips', await skip(A, S8.rounds[2].id), 'SK_CLOSED')
  expectHint('closed couple: no live invite', await invite(A, S8.id), 'SK_CLOSED')
  expectHint('closed couple: no new set', await insertSet(admin, cid, A.id, 'bank', 'food', null, bankSet('food', 92)), 'SK_CLOSED')
  ok('closed couple: no pushes', (await pr(S8.id, A.id, 'nudge'))?.reason === 'closed')
  const aClosed = L.parseHub((await hub(A)).data)
  ok('closed couple: A still reads the history', aClosed.closed && aClosed.sets.length === 4 &&L.parseSetState((await state(A, S1)).data).rounds.every((r) => r.partner))
  ok('closed couple: A can still end the open set', !(await endSet(A, S8.id)).error)
  expectHint('B, after leaving, cannot read the sets', await state(B, S1), 'SK_NOT_FOUND')
  ok('B, after leaving, has no couple in the hub', L.parseHub((await hub(B)).data).coupleId === null)
}

try { await main() } catch (e) { failures.push(`crash: ${e.stack ?? e.message}`) }
finally {
  for (const [client, ch] of channels) { try { await client.removeChannel(ch) } catch { /* closing anyway */ } }
  const { data: leftovers } = await admin.from('couple_members').select('couple_id').in('profile_id', created)
  for (const m of leftovers ?? []) couples.add(m.couple_id)
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('game samakan verification passed')
process.exit(0)
