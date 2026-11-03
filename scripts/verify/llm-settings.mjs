// Admin → AI (paste the OpenRouter key in the app) against LOCAL Supabase and
// the app on :3030.
//   node scripts/verify/llm-settings.mjs
// Prints "LLM SETTINGS VERIFY PASSED" only when every check passes. Refuses to
// run while a key is already stored, so a real key is never overwritten. Never
// calls OpenRouter (the connection test is only run with no key set).
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
const APP = process.env.VERIFY_APP_URL ?? 'http://localhost:3030'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_ ?? '') || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error('Refusing to run: Supabase or the app is not local')
  process.exit(1)
}
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, ANON, opts)
const service = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

let pass = 0
const failures = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' — ' + extra : ''}`) }
const created = []

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

// The admin page shows the last "Tes koneksi" result; put the real one back.
let restoreTest = null

const KEY = `sk-or-v1-verify${'0123456789abcdef'.repeat(3)}Z9yW`
const KEY2 = `sk-or-v1-second${'fedcba9876543210'.repeat(3)}Q7xV`

async function main() {
  const { data: before } = await service.rpc('llm_runtime_config')
  if (before?.[0]?.api_key) {
    console.error('Refusing to run: an API key is already stored in Admin → AI. Remove it first (or run on a fresh DB).')
    process.exit(1)
  }
  const modelBefore = before?.[0]?.model ?? null
  const { data: testBefore } = await service.from('llm_settings').select('tested_at, test_ok, test_message').single()
  restoreTest = testBefore

  const adminC = mk(), userC = mk(), anonC = mk()
  const adminId = await signUp(adminC, 'llm-admin')
  await signUp(userC, 'llm-user')
  await service.from('profiles').update({ role: 'admin' }).eq('id', adminId)

  // --- RPC permissions -----------------------------------------------------
  const uStatus = await userC.rpc('admin_llm_status')
  ok('non-admin cannot read status', !!uStatus.error, JSON.stringify(uStatus.data))
  const uSet = await userC.rpc('admin_set_llm_key', { p_key: KEY })
  ok('non-admin cannot set a key', !!uSet.error)
  const uRuntime = await userC.rpc('llm_runtime_config')
  ok('signed-in user cannot read the runtime key', !!uRuntime.error && !uRuntime.data)
  const aRuntime = await anonC.rpc('llm_runtime_config')
  ok('anon cannot read the runtime key', !!aRuntime.error && !aRuntime.data)
  const uTable = await userC.from('llm_settings').select('*')
  ok('llm_settings table not readable by users', !!uTable.error || (uTable.data ?? []).length === 0)
  const uRecord = await userC.rpc('record_llm_test', { p_ok: true, p_message: 'fake' })
  ok('users cannot record a test result', !!uRecord.error)
  const vaultRead = await userC.schema('vault').from('decrypted_secrets').select('*')
  ok('users cannot read vault', !!vaultRead.error || (vaultRead.data ?? []).length === 0)

  // --- Admin set / status / runtime ----------------------------------------
  const bad = await adminC.rpc('admin_set_llm_key', { p_key: 'abc' })
  ok('too-short key refused', /Format key/.test(bad.error?.message ?? ''), bad.error?.message)
  const spaced = await adminC.rpc('admin_set_llm_key', { p_key: 'sk-or-v1 has spaces in it 1234567890' })
  ok('key with spaces refused', !!spaced.error)

  const set = await adminC.rpc('admin_set_llm_key', { p_key: `  ${KEY}\n` })
  ok('admin sets a key (trimmed)', !set.error && set.data?.key_set === true, set.error?.message)
  ok('status shows only the last 4', set.data?.key_last4 === KEY.slice(-4) && !JSON.stringify(set.data).includes(KEY.slice(0, 20)))
  const { data: rt } = await service.rpc('llm_runtime_config')
  ok('server reads the exact key back', rt?.[0]?.api_key === KEY)
  const { data: rawRow } = await service.from('llm_settings').select('*').single()
  ok('settings row stores no key', !JSON.stringify(rawRow).includes(KEY.slice(0, 20)))

  const replaced = await adminC.rpc('admin_set_llm_key', { p_key: KEY2 })
  const { data: rt2 } = await service.rpc('llm_runtime_config')
  ok('replacing the key updates the same secret', !replaced.error && rt2?.[0]?.api_key === KEY2 && replaced.data?.key_last4 === KEY2.slice(-4))
  const tooLong = await adminC.rpc('admin_set_llm_key', { p_key: 'sk-' + 'a'.repeat(400) })
  ok('over-long key refused', !!tooLong.error)

  const badModel = await adminC.rpc('admin_set_llm_model', { p_model: 'not a model!' })
  ok('invalid model id refused', !!badModel.error)
  const model = await adminC.rpc('admin_set_llm_model', { p_model: 'openai/gpt-5.6-luna' })
  ok('admin sets a model', model.data?.model === 'openai/gpt-5.6-luna')
  const { data: rt3 } = await service.rpc('llm_runtime_config')
  ok('server sees the model', rt3?.[0]?.model === 'openai/gpt-5.6-luna')
  const reset = await adminC.rpc('admin_set_llm_model', { p_model: '' })
  ok('empty model = default', reset.data?.model === null)

  // --- API route -------------------------------------------------------------
  const adminCookie = await cookieFor(adminC)
  const userCookie = await cookieFor(userC)
  ok('API: signed out → 401', (await api('GET', null)).status === 401)
  ok('API: non-admin → 403', (await api('GET', userCookie)).status === 403)
  const g = await api('GET', adminCookie)
  ok('API: admin GET shows admin key in use', g.status === 200 && g.json?.in_use?.source === 'admin' && g.json?.key_last4 === KEY2.slice(-4), g.text.slice(0, 200))
  ok('API: response never contains the key', !g.text.includes(KEY2.slice(0, 20)))
  const putKey = await api('PUT', adminCookie, { apiKey: KEY })
  ok('API: PUT key → last4 updated, key not echoed', putKey.status === 200 && putKey.json?.key_last4 === KEY.slice(-4) && !putKey.text.includes(KEY.slice(0, 20)))
  const putBad = await api('PUT', adminCookie, { apiKey: 'x' })
  ok('API: bad key → 400 with message', putBad.status === 400 && /Format key/.test(putBad.json?.error ?? ''))
  const putModel = await api('PUT', adminCookie, { model: 'openai/gpt-6-luna-pro' })
  ok('API: PUT model', putModel.status === 200 && putModel.json?.in_use?.model === 'openai/gpt-6-luna-pro')
  await api('PUT', adminCookie, { model: null })
  const userPut = await api('PUT', userCookie, { apiKey: KEY2 })
  ok('API: non-admin PUT → 403', userPut.status === 403)
  const del = await api('DELETE', adminCookie)
  ok('API: DELETE clears the key', del.status === 200 && del.json?.key_set === false && del.json?.key_last4 === null)
  const { data: rt4 } = await service.rpc('llm_runtime_config')
  ok('server sees no key after delete', !rt4?.[0]?.api_key)
  const test = await api('POST', adminCookie, { action: 'test' })
  const envHasKey = !!env.LLM_API_KEY
  if (!envHasKey) {
    ok('API: test with no key → not ok, no network', test.status === 200 && test.json?.check?.ok === false && /Belum ada API key/.test(test.json?.check?.message ?? ''), test.text.slice(0, 200))
  } else {
    pass++ // with an env key the test would call OpenRouter; skipped on purpose
  }
  ok('API: unknown action → 400', (await api('POST', adminCookie, { action: 'nope' })).status === 400)

  // restore the model that was there before
  if (modelBefore) await adminC.rpc('admin_set_llm_model', { p_model: modelBefore })
}

try {
  await main()
} catch (e) {
  failures.push(`crashed: ${e.message}`)
} finally {
  for (const id of created) await service.auth.admin.deleteUser(id)
  if (restoreTest) await service.from('llm_settings').update(restoreTest).eq('id', true)
}
for (const f of failures) console.log('FAIL', f)
console.log(`${pass} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
console.log('LLM SETTINGS VERIFY PASSED')
