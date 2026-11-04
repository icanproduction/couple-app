// Samakan v2 server (leaf w2-sam-server) against a LOCAL Supabase, with every
// model call going to a local fake Messages API.
//   node scripts/verify/samakan-ai.mjs           # the gate (mocked SDK)
//   node scripts/verify/samakan-ai.mjs --live    # + ONE real Sonnet rounds call (≤ 1000 output tokens)
// Spec docs/superpowers/specs/2026-11-04-samakan-remake.md gates 12-19, 24 and
// 25 (410): the AI personal set (identical on both phones), the bank fallback
// on every failure reason, the personal switch (no reads, no call), the daily
// personal limit, the Samakan budget, the read-out (one per set, template
// fallback), push claims, caps, quiet hours, the live-invite single push,
// the nudge, and the retired create route.
// Prints "samakan ai verification passed" only when every check passes.
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const LIVE = process.argv.includes('--live')

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
let anthropicKey = ''
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const e = readEnvFile(f)
  if (e.ANTHROPIC_API_KEY) anthropicKey = e.ANTHROPIC_API_KEY
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

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' :: ' + extra : ''}`) }

// ---------- schema the routes depend on (wave 1) ----------
async function preflight() {
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const sets = await service.from('samakan_sets').select('id').limit(1)
  ok('samakan_v2 migration applied (samakan_sets)', !sets.error, sets.error?.message)
  const history = await service.rpc('samakan_history', { p_couple: '00000000-0000-0000-0000-000000000000' })
  ok('samakan_history callable by the service role', !history.error && Array.isArray(history.data?.bank), history.error?.message)
  const claim = await service.rpc('samakan_claim_push', { p_set_id: '00000000-0000-0000-0000-000000000000', p_recipient: '00000000-0000-0000-0000-000000000000', p_kind: 'start' })
  ok('samakan_claim_push answers a missing set with not_found', claim.data?.ok === false && claim.data?.reason === 'not_found', JSON.stringify(claim.data ?? claim.error))
  const usage = await service.from('ai_usage').select('id').eq('feature', 'samakan_set').limit(1)
  ok('ai_usage takes the samakan_set feature (migration 20261104110000_ai_core)', !usage.error, usage.error?.message)
  const prefs = await service.from('notification_prefs').select('games').limit(1)
  ok('notification_prefs.games exists', !prefs.error, prefs.error?.message)
}

// ---------- vitest runner (same shape as ai-core.mjs) ----------
function runVitest(files, extraEnv, label, { filter, checkSkipped = true } = {}) {
  const out = mkdtempSync(join(tmpdir(), 'samakan-ai-'))
  const report = join(out, 'report.json')
  const args = ['run', ...files, '--reporter=json', `--outputFile=${report}`]
  if (filter) args.push('-t', filter)
  const res = spawnSync(join(root, 'node_modules', '.bin', 'vitest'), args, {
    cwd: root, env: { ...process.env, ...extraEnv }, encoding: 'utf8', maxBuffer: 64 << 20,
  })
  let json = null
  try { json = JSON.parse(readFileSync(report, 'utf8')) } catch { /* no report */ }
  rmSync(out, { recursive: true, force: true })
  if (!json) {
    failures.push(`${label}: vitest produced no report (exit ${res.status}) ${(res.stderr || res.stdout).slice(-600)}`)
    return null
  }
  console.log(`${label}: ${json.numPassedTests} passed, ${json.numFailedTests} failed, ${json.numPendingTests} skipped`)
  const failed = json.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed')
    .map((a) => `${a.fullName}: ${(a.failureMessages ?? []).join(' ').slice(0, 400)}`))
  ok(`${label}: ${json.numPassedTests} tests passed, none failed`, json.numFailedTests === 0 && res.status === 0 && json.numPassedTests > 0, failed.join(' | ') || `exit ${res.status}`)
  if (checkSkipped) ok(`${label}: only the live smoke test skipped`, json.numPendingTests === 1, `${json.numPendingTests} skipped`)
  for (const f of json.testResults) for (const a of f.assertionResults) if (a.status === 'passed') console.log(`  ok ${a.title}`)
  return json
}

const TEST = 'src/lib/__tests__/samakan-ai.test.ts'
const dbEnv = {
  SAMAKAN_AI_DB: '1',
  SAMAKAN_AI_LIVE: '',
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  // The real key stays out and the base URL points nowhere: a test that
  // forgot its fake server can't reach the real API.
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
}

try {
  await preflight()
  runVitest([TEST], dbEnv, 'samakan server (mocked SDK, local Supabase)')

  if (LIVE) {
    if (!anthropicKey) {
      failures.push('--live: ANTHROPIC_API_KEY is not set in the env files')
    } else {
      const notesDir = mkdtempSync(join(tmpdir(), 'samakan-live-'))
      const notes = join(notesDir, 'notes.json')
      runVitest([TEST], {
        ...dbEnv, SAMAKAN_AI_DB: '', SAMAKAN_AI_LIVE: '1', SAMAKAN_AI_LIVE_OUT: notes,
        ANTHROPIC_API_KEY: anthropicKey, ANTHROPIC_BASE_URL: '',
      }, 'live Sonnet call', { filter: 'samakan ai live smoke test', checkSkipped: false })
      // Usage, rounds and the ledger row only; the key is never written there.
      if (existsSync(notes)) console.log(readFileSync(notes, 'utf8'))
      rmSync(notesDir, { recursive: true, force: true })
    }
  }
} catch (e) {
  failures.push(`crashed: ${e.message}`)
}

for (const f of failures) console.log('FAIL', f)
console.log(`${pass} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
console.log('samakan ai verification passed')
