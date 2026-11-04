// AI core (Claude Sonnet) check against LOCAL Supabase. No network beyond
// localhost: every model call goes to a local fake Messages API.
//   node scripts/verify/ai-core.mjs            # the gate
//   node scripts/verify/ai-core.mjs --live     # + ONE real Sonnet call (≤ 64 output tokens)
//   node scripts/verify/ai-core.mjs --live --measure   # + one real daily question and Date Ideas run
// Prints "ai core verification passed" only when every check passes.
//
// Checks: ai_usage and ai_usage_reserve are closed to anon and signed-in users
// and open to the service role; the cap math (spend today vs cap, in-flight
// reservations, parallel calls); the Jakarta day; the notification_prefs
// games column (default on, owner-writable) and the push filter honoring it;
// then the claudeJson contract (no key / cap / refusal / invalid / success
// logs usage) in vitest, including a run against this database.
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

const LIVE = process.argv.includes('--live')
const MEASURE = process.argv.includes('--measure')

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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, ANON, opts)
const service = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

const { isPushMuted } = await import(pathToFileURL(join(root, 'src', 'lib', 'quiet-hours.ts')).href)

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const users = []
const couples = []

const jakartaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function signUp(client, tag) {
  const { data, error } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (error || !data?.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  users.push(data.user.id)
  return data.user.id
}

async function newCouple() {
  const { data, error } = await service.from('couples')
    .insert({ invite_code: `AIV${Math.random().toString(36).slice(2, 9).toUpperCase()}` }).select('id').single()
  if (error) throw new Error(`couple insert: ${error.message}`)
  couples.push(data.id)
  return data.id
}

const reserve = (couple, feature, cap, estimate) =>
  service.rpc('ai_usage_reserve', { p_couple: couple, p_feature: feature, p_cap: cap, p_estimate: estimate })

async function spend(couple, feature) {
  const { data, error } = await service.from('ai_usage').select('cost_usd').eq('couple_id', couple).eq('feature', feature).eq('day', jakartaDay())
  if (error) throw new Error(error.message)
  return Math.round(data.reduce((t, r) => t + Number(r.cost_usd), 0) * 1e6) / 1e6
}

async function dbChecks() {
  // --- Schema ----------------------------------------------------------------
  const { data: probe, error: probeErr } = await service.from('ai_usage').select('id').limit(1)
  ok('ai_usage exists (migration 20261104110000_ai_core applied)', !probeErr && Array.isArray(probe), probeErr?.message)

  const userC = mk(), anonC = mk()
  const userId = await signUp(userC, 'ai-core-user')
  const couple = await newCouple()

  // --- Service role ------------------------------------------------------------
  const ins = await service.from('ai_usage').insert({ couple_id: couple, feature: 'daily_question', cost_usd: 0.001, outcome: 'ok' }).select('*').single()
  ok('service role can insert a usage row', !ins.error && ins.data?.id, ins.error?.message)
  ok('day defaults to the Asia/Jakarta date', ins.data?.day === jakartaDay(), `${ins.data?.day} vs ${jakartaDay()}`)
  const rowId = ins.data?.id
  const badFeature = await service.from('ai_usage').insert({ couple_id: couple, feature: 'horoscope', cost_usd: 0 })
  ok('feature must be one of the six', !!badFeature.error)
  const negative = await service.from('ai_usage').insert({ couple_id: couple, feature: 'daily_question', cost_usd: -1 })
  ok('cost cannot be negative', !!negative.error)

  // --- Clients locked out -------------------------------------------------------
  for (const [who, client] of [['signed-in user', userC], ['anon', anonC]]) {
    const sel = await client.from('ai_usage').select('*')
    ok(`${who} cannot read ai_usage`, !!sel.error || (sel.data ?? []).length === 0, JSON.stringify(sel.data))
    const add = await client.from('ai_usage').insert({ couple_id: couple, feature: 'daily_question', cost_usd: 0 })
    ok(`${who} cannot insert into ai_usage`, !!add.error)
    await client.from('ai_usage').update({ cost_usd: 0 }).eq('id', rowId)
    await client.from('ai_usage').delete().eq('id', rowId)
    const { data: still } = await service.from('ai_usage').select('cost_usd').eq('id', rowId).maybeSingle()
    ok(`${who} cannot update or delete a usage row`, Number(still?.cost_usd) === 0.001, JSON.stringify(still))
    const rpc = await client.rpc('ai_usage_reserve', { p_couple: couple, p_feature: 'daily_question', p_cap: 1, p_estimate: 0 })
    ok(`${who} cannot call ai_usage_reserve`, !!rpc.error && !rpc.data)
  }

  // --- Cap math ------------------------------------------------------------------
  // ai_usage_reserve answers {id} (reserved), {blocked: 'cap'} or {blocked: 'busy'}.
  const granted = (r) => typeof r?.data?.id === 'string'
  const blocked = (r, why) => r?.data?.blocked === why && !r.data.id

  // samakan_set cap 0.02, calls in flight reserving 0.008 each: 0 → 0.008 → 0.016 allowed,
  // then "busy" (nothing finished yet, but the reservations could use the rest).
  const steps = []
  for (let i = 0; i < 4; i++) steps.push(await reserve(couple, 'samakan_set', 0.02, 0.008))
  ok('reserve: allowed while spend today is under the cap', steps.slice(0, 3).every(granted), JSON.stringify(steps.map((s) => s.data)))
  ok('reserve: in-flight reservations block the next call as busy', blocked(steps[3], 'busy'), JSON.stringify(steps[3].data))
  ok('reserve: in-flight reservations count as spend', (await spend(couple, 'samakan_set')) === 0.024)
  // Settling a reservation with a cheaper real cost frees room again.
  await service.from('ai_usage').update({ cost_usd: 0.001, outcome: 'ok' }).in('id', steps.slice(0, 3).map((s) => s.data.id))
  ok('reserve: real cost replaces the reservation', (await spend(couple, 'samakan_set')) === 0.003)
  ok('reserve: allowed again after settling', granted(await reserve(couple, 'samakan_set', 0.02, 0.008)))
  // Finished calls at the cap: "cap", whatever is in flight.
  await service.from('ai_usage').insert({ couple_id: couple, feature: 'samakan_set', cost_usd: 0.02, outcome: 'ok' })
  ok('reserve: finished spend at the cap → cap', blocked(await reserve(couple, 'samakan_set', 0.02, 0.008), 'cap'))
  // Exactly at the cap counts as reached.
  await service.from('ai_usage').insert({ couple_id: couple, feature: 'samakan_readout', cost_usd: 0.008, outcome: 'ok' })
  ok('reserve: spend equal to the cap is refused', blocked(await reserve(couple, 'samakan_readout', 0.008, 0), 'cap'))
  // A pending row older than 5 minutes is a dead request: counted as spent.
  await service.from('ai_usage').insert({ couple_id: couple, feature: 'pet_note', cost_usd: 0.015, outcome: 'pending', created_at: new Date(Date.now() - 6 * 60_000).toISOString() })
  ok('reserve: a stale pending row counts as spent (cap, not busy)', blocked(await reserve(couple, 'pet_note', 0.015, 0.001), 'cap'))
  // Caps are per feature and per couple.
  ok('reserve: another feature has its own cap', granted(await reserve(couple, 'pet_weekly', 0.01, 0.001)))
  const other = await newCouple()
  ok('reserve: another couple has its own cap', granted(await reserve(other, 'samakan_readout', 0.008, 0.001)))
  // Yesterday's spend does not count.
  const yesterday = new Date(Date.now() - 86_400_000)
  const yDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(yesterday)
  await service.from('ai_usage').insert({ couple_id: couple, feature: 'daily_question', day: yDay, cost_usd: 5, outcome: 'ok' })
  ok('reserve: yesterday\'s spend does not count', granted(await reserve(couple, 'daily_question', 0.006, 0.001)))

  // Parallel: date_ideas cap 0.012, 8 calls reserving 0.005 each → 0, 0.005, 0.010 pass; the rest are busy.
  const parallel = await Promise.all(Array.from({ length: 8 }, () => reserve(couple, 'date_ideas', 0.012, 0.005)))
  const grantedCount = parallel.filter(granted).length
  ok('reserve: 8 parallel calls cannot slip past the cap (exactly 3 granted, 5 busy)',
    grantedCount === 3 && parallel.filter((r) => blocked(r, 'busy')).length === 5,
    `granted ${grantedCount}, errors ${parallel.filter((r) => r.error).map((r) => r.error.message).join('; ')}`)
  ok('reserve: parallel spend stays within one call of the cap', (await spend(couple, 'date_ideas')) === 0.015)

  // No couple: logged, never capped.
  const sys = await reserve(null, 'daily_question', 0, 0.001)
  ok('reserve: no couple → a row without a cap check', granted(sys), sys.error?.message)
  if (granted(sys)) await service.from('ai_usage').delete().eq('id', sys.data.id)
  const neg = await reserve(couple, 'daily_question', 1, -0.5)
  ok('reserve: a negative estimate is refused', !!neg.error)

  // Cascade: removing a couple removes its ledger.
  await service.from('couples').delete().eq('id', other)
  const { data: orphan } = await service.from('ai_usage').select('id').eq('couple_id', other)
  ok('deleting a couple deletes its usage rows', (orphan ?? []).length === 0)

  // --- games notification switch --------------------------------------------------
  const fresh = await userC.from('notification_prefs').upsert({ profile_id: userId, kangen: true }, { onConflict: 'profile_id' }).select('games').single()
  ok('notification_prefs.games defaults to on', !fresh.error && fresh.data?.games === true, fresh.error?.message)
  const off = await userC.from('notification_prefs').update({ games: false }).eq('profile_id', userId).select('games').single()
  ok('the owner can switch games off', !off.error && off.data?.games === false, off.error?.message)
  const anonRead = await anonC.from('notification_prefs').select('games').eq('profile_id', userId)
  ok('nobody else can read the switch', !!anonRead.error || (anonRead.data ?? []).length === 0)
  const nullGames = await userC.from('notification_prefs').update({ games: null }).eq('profile_id', userId)
  ok('games cannot be null', !!nullGames.error)

  // --- Push filter (unit) -------------------------------------------------------------
  const prefs = { kangen: true, letters: true, moments: true, reminders: true, activity: true, games: true, quiet_start: null, quiet_end: null }
  const night = new Date('2026-11-04T15:00:00Z') // 22:00 WIB
  ok('push filter: games off mutes a games push', isPushMuted({ ...prefs, games: false }, 'games', {}, night) === true)
  ok('push filter: games off still mutes with ignoreQuietHours', isPushMuted({ ...prefs, games: false }, 'games', { ignoreQuietHours: true }, night) === true)
  ok('push filter: games on delivers', isPushMuted(prefs, 'games', {}, night) === false)
  ok('push filter: quiet hours hold a games push', isPushMuted({ ...prefs, quiet_start: 22, quiet_end: 6 }, 'games', {}, night) === true)
  ok('push filter: games off leaves other kinds alone', isPushMuted({ ...prefs, games: false }, 'kangen', {}, night) === false)
  ok('push filter: the stored row from the database is honored',
    isPushMuted({ ...prefs, ...off.data }, 'games', {}, night) === true)
}

function runVitest(files, extraEnv, label, { allowSkipped = 0 } = {}) {
  const out = mkdtempSync(join(tmpdir(), 'ai-core-'))
  const report = join(out, 'report.json')
  const childEnv = { ...process.env, ...extraEnv }
  const res = spawnSync(join(root, 'node_modules', '.bin', 'vitest'), ['run', ...files, '--reporter=json', `--outputFile=${report}`], {
    cwd: root, env: childEnv, encoding: 'utf8', maxBuffer: 64 << 20,
  })
  let json = null
  try { json = JSON.parse(readFileSync(report, 'utf8')) } catch { /* no report */ }
  rmSync(out, { recursive: true, force: true })
  if (!json) {
    failures.push(`${label}: vitest produced no report (exit ${res.status}) ${(res.stderr || res.stdout).slice(-400)}`)
    return null
  }
  console.log(`${label}: ${json.numPassedTests} passed, ${json.numFailedTests} failed, ${json.numPendingTests} skipped (${json.numTotalTestSuites} suites)`)
  const failed = json.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => `${a.fullName}: ${(a.failureMessages ?? []).join(' ').slice(0, 300)}`))
  ok(`${label}: ${json.numPassedTests} tests passed, none failed`, json.numFailedTests === 0 && res.status === 0, failed.join(' | '))
  ok(`${label}: nothing unexpected skipped`, json.numPendingTests === allowSkipped, `${json.numPendingTests} skipped`)
  return { json, output: `${res.stdout}\n${res.stderr}` }
}

try {
  await dbChecks()

  // The claudeJson contract, mocked: unit tests plus the run against this
  // database. The real key is kept out and the base URL points nowhere, so
  // a test that forgot its fake server cannot reach the real API.
  const dbEnv = {
    AI_CORE_DB: '1',
    NEXT_PUBLIC_SUPABASE_URL: URL_,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    CLAUDE_LIVE: '',
  }
  runVitest([
    'src/lib/__tests__/claude.test.ts',
    'src/lib/__tests__/ai-core.db.test.ts',
    'src/lib/__tests__/ai-features.test.ts',
    'src/lib/__tests__/ai-routes.test.ts',
    'src/lib/__tests__/push-games.test.ts',
    'src/lib/__tests__/admin-llm.test.ts',
  ], dbEnv, 'claudeJson contract (mocked)')

  if (LIVE) {
    if (!env.ANTHROPIC_API_KEY) {
      failures.push('--live: ANTHROPIC_API_KEY is not set in the env files')
    } else {
      const notesDir = mkdtempSync(join(tmpdir(), 'ai-live-'))
      const notes = join(notesDir, 'notes.txt')
      runVitest(['src/lib/__tests__/claude.live.test.ts'], {
        ...dbEnv,
        AI_CORE_DB: '',
        CLAUDE_LIVE: '1',
        CLAUDE_MEASURE: MEASURE ? '1' : '',
        CLAUDE_LIVE_OUT: notes,
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        ANTHROPIC_BASE_URL: '',
      }, MEASURE ? 'live Sonnet calls' : 'live Sonnet call', { allowSkipped: MEASURE ? 0 : 1 })
      // Usage and ledger rows only; the key is never written there.
      if (existsSync(notes)) console.log(readFileSync(notes, 'utf8').trim())
      rmSync(notesDir, { recursive: true, force: true })
    }
  }
} catch (e) {
  failures.push(`crashed: ${e.message}`)
} finally {
  for (const id of couples) await service.from('couples').delete().eq('id', id)
  for (const id of users) await service.auth.admin.deleteUser(id)
}

for (const f of failures) console.log('FAIL', f)
console.log(`${pass} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
console.log('ai core verification passed')
