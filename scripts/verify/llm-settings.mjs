// Admin → AI (Claude status) against LOCAL Supabase and the app on :3030.
//   node scripts/verify/llm-settings.mjs          # never calls Claude
//   node scripts/verify/llm-settings.mjs --live   # also presses Test connection once (one tiny Sonnet call)
// Prints "LLM SETTINGS VERIFY PASSED" only when every check passes.
//
// The contract: GET/POST /api/admin/llm are admin-only; the key comes from
// ANTHROPIC_API_KEY on the server and is never echoed (last 4 characters at
// most); the model is fixed to claude-sonnet-5-5; the old key/model editing
// (PUT/DELETE) is gone; today's spend comes from ai_usage.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')

const LIVE = process.argv.includes('--live')

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
const APP = process.env.VERIFY_APP_URL ?? 'http://localhost:3030'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_ ?? '') || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error('Refusing to run: Supabase or the app is not local')
  process.exit(1)
}
const reachable = await fetch(APP, { signal: AbortSignal.timeout(5_000) }).then(() => true, () => false)
if (!reachable) {
  console.error(`Refusing to run: the app is not answering on ${APP} (start it with next dev -p 3030)`)
  process.exit(1)
}
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, ANON, opts)
const service = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

/** What the app on :3030 is expected to use (it reads the same env files). */
const KEY = (env.ANTHROPIC_API_KEY ?? '').trim()

/** AI_DAILY_CAP_USD as written in src/lib/claude.ts (the one source of the caps). */
function capsFromSource() {
  const src = readFileSync(join(root, 'src', 'lib', 'claude.ts'), 'utf8')
  const block = src.match(/export const AI_DAILY_CAP_USD[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const caps = {}
  for (const m of block.matchAll(/^\s*([a-z_]+):\s*([0-9.]+),?\s*$/gm)) caps[m[1]] = Number(m[2])
  return caps
}
const SOURCE_CAPS = capsFromSource()

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const created = []
let coupleId = null

async function signUp(client, tag) {
  const { data, error } = await client.auth.signUp({ email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`, password: 'verify-pass-123' })
  if (error || !data?.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  created.push(data.user.id)
  await client.from('profiles').update({ name: tag.toUpperCase() }).eq('id', data.user.id)
  return data.user.id
}

async function cookieFor(client) {
  const { data: { session } } = await client.auth.getSession()
  const jar = new Map()
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) { if (value) jar.set(name, value); else jar.delete(name) } },
    },
  })
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  for (let i = 0; i < 20 && jar.size === 0; i++) await new Promise((r) => setTimeout(r, 25))
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
}

async function api(method, cookie, body) {
  const res = await fetch(APP + '/api/admin/llm', {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text }
}

/** Neither the key nor any long piece of it may appear in a response. */
const leaksKey = (text) => KEY.length >= 12 && (text.includes(KEY) || text.includes(KEY.slice(0, 12)) || text.includes(KEY.slice(-12)))

async function main() {
  const adminC = mk(), userC = mk()
  const adminId = await signUp(adminC, 'llm-admin')
  await signUp(userC, 'llm-user')
  await service.from('profiles').update({ role: 'admin' }).eq('id', adminId)

  // A spend row for today, so the page has something to total.
  const { data: couple, error: coupleErr } = await service.from('couples')
    .insert({ invite_code: `LLM${Math.random().toString(36).slice(2, 9).toUpperCase()}` }).select('id').single()
  if (coupleErr) throw new Error(`couple insert: ${coupleErr.message}`)
  coupleId = couple.id
  const { error: usageErr } = await service.from('ai_usage').insert({ couple_id: coupleId, feature: 'daily_question', cost_usd: 0.0042, outcome: 'ok' })
  ok('test spend row inserted', !usageErr, usageErr?.message)

  // --- The old Vault key stays unreadable for users (rows left untouched) ------
  // The v0.7 objects (llm_settings, the Vault secret, its RPCs) are no longer
  // used by the app but still exist, so they must stay closed.
  const anonC = mk()
  const uRuntime = await userC.rpc('llm_runtime_config')
  ok('signed-in user cannot read the old runtime key', !!uRuntime.error && !uRuntime.data)
  const aRuntime = await anonC.rpc('llm_runtime_config')
  ok('anon cannot read the old runtime key', !!aRuntime.error && !aRuntime.data)
  const uStatus = await userC.rpc('admin_llm_status')
  ok('non-admin cannot read the old status RPC', !!uStatus.error, JSON.stringify(uStatus.data))
  const uSet = await userC.rpc('admin_set_llm_key', { p_key: 'sk-ant-should-not-be-accepted-0000' })
  ok('non-admin cannot set a key through the old RPC', !!uSet.error)
  const uTable = await userC.from('llm_settings').select('*')
  ok('llm_settings table not readable by users', !!uTable.error || (uTable.data ?? []).length === 0)
  const uRecord = await userC.rpc('record_llm_test', { p_ok: true, p_message: 'fake' })
  ok('users cannot record a test result', !!uRecord.error)
  const vaultRead = await userC.schema('vault').from('decrypted_secrets').select('*')
  ok('users cannot read vault', !!vaultRead.error || (vaultRead.data ?? []).length === 0)

  // --- Access ------------------------------------------------------------------
  const adminCookie = await cookieFor(adminC)
  const userCookie = await cookieFor(userC)
  ok('GET signed out → 401', (await api('GET', null)).status === 401)
  ok('GET non-admin → 403', (await api('GET', userCookie)).status === 403)
  ok('POST test signed out → 401', (await api('POST', null, { action: 'test' })).status === 401)
  ok('POST test non-admin → 403', (await api('POST', userCookie, { action: 'test' })).status === 403)

  // --- Status ------------------------------------------------------------------
  const g = await api('GET', adminCookie)
  ok('GET admin → 200', g.status === 200, g.text.slice(0, 200))
  ok('model is fixed to Sonnet 5.5', g.json?.model === 'claude-sonnet-5-5' && g.json?.model_label === 'Claude Sonnet 5.5')
  ok('key comes from the server env', g.json?.key_source === 'env')
  ok('configured matches ANTHROPIC_API_KEY', g.json?.configured === (KEY.length > 0))
  ok('only the last 4 characters are shown', KEY ? g.json?.key_last4 === KEY.slice(-4) : g.json?.key_last4 === null, String(g.json?.key_last4))
  ok('the key is never echoed', !leaksKey(g.text))
  // Every feature's cap, exactly as AI_DAILY_CAP_USD in src/lib/claude.ts (six
  // features; the values move when the driver retunes a cap, the contract doesn't).
  const capKeys = Object.keys(SOURCE_CAPS).sort()
  ok('source caps parsed (six features)', capKeys.join() === 'daily_question,date_ideas,pet_note,pet_weekly,samakan_readout,samakan_set'
    && Object.values(SOURCE_CAPS).every((v) => Number.isFinite(v) && v > 0), JSON.stringify(SOURCE_CAPS))
  ok('caps are listed per feature', Object.keys(g.json?.caps_usd ?? {}).sort().join() === capKeys.join()
    && capKeys.every((k) => g.json.caps_usd[k] === SOURCE_CAPS[k]), JSON.stringify(g.json?.caps_usd))
  ok('today\'s spend includes the ledger', typeof g.json?.spend_today_usd === 'number' && g.json.spend_today_usd >= 0.0042
    && g.json?.spend_by_feature?.daily_question >= 0.0042, JSON.stringify({ total: g.json?.spend_today_usd, by: g.json?.spend_by_feature }))
  ok('day is the Jakarta date', g.json?.day === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))

  // --- Removed: pasting a key or overriding the model --------------------------
  const put = await api('PUT', adminCookie, { apiKey: 'sk-ant-should-not-be-accepted-0000' })
  ok('PUT (paste a key) is gone → 405', put.status === 405, String(put.status))
  const del = await api('DELETE', adminCookie)
  ok('DELETE (remove the key) is gone → 405', del.status === 405, String(del.status))
  ok('unknown action → 400', (await api('POST', adminCookie, { action: 'nope' })).status === 400)

  // --- Test connection ---------------------------------------------------------
  if (!KEY) {
    const t = await api('POST', adminCookie, { action: 'test' })
    ok('test with no key → not ok, no network', t.status === 200 && t.json?.check?.ok === false && /No API key yet/.test(t.json?.check?.message ?? ''), t.text.slice(0, 200))
  } else if (LIVE) {
    const t = await api('POST', adminCookie, { action: 'test' })
    ok('test connection → ok', t.status === 200 && t.json?.check?.ok === true, t.text.slice(0, 200))
    ok('test response never echoes the key', !leaksKey(t.text))
  } else {
    // With a key the test would call Claude; run with --live to include it.
    console.log('note: Test connection not pressed (a key is set and --live was not passed)')
  }
}

try {
  await main()
} catch (e) {
  failures.push(`crashed: ${e.message}`)
} finally {
  if (coupleId) await service.from('couples').delete().eq('id', coupleId)
  for (const id of created) await service.auth.admin.deleteUser(id)
}
for (const f of failures) console.log('FAIL', f)
console.log(`${pass} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
console.log('LLM SETTINGS VERIFY PASSED')
